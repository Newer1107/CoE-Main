#!/usr/bin/env python3
"""TCET ERP attendance — uses the post-auth-crash session trick.

Modes:
  fetch           fresh session + captcha image -> <workdir>/captcha.png
  login <captcha> auth postback (crash expected = session authenticated)
  report          print attendance table for the authenticated session
  shot            render attendance table -> <workdir>/attendance.png
  fast            fetch -> local OCR captcha -> login -> report rows + PNG in one call

Concurrency: every temp file lives under --workdir <dir> (default /tmp/erp).
Two runs sharing a workdir clobber each other's session/captcha — the sync
worker always passes a per-job dir (/tmp/erp/<jobId>/).
"""
import sys, re, json, base64, pickle, socket, os, time, argparse
import urllib.request, urllib.parse, http.cookiejar

BASE = "http://erp.tcetmumbai.in"
LOGIN = BASE + "/AdminLogin.aspx"
REPORT = BASE + "/Student/SelfAttendence.aspx"
PIN = os.environ.get("ERP_PIN", "14.96.40.78")  # other DNS IP is dead; round-robin breaks per-server sessions
USER = os.environ.get("ERP_USER", "S1032241230")
PW = os.environ.get("ERP_PW", "Raunak@12345")

_ap = argparse.ArgumentParser()
_ap.add_argument("mode", choices=["fetch", "login", "report", "shot", "fast", "probe"])
_ap.add_argument("--workdir", default=os.environ.get("ERP_WORKDIR", "/tmp/erp"))
_args = _ap.parse_args()
WD = _args.workdir
os.makedirs(WD, exist_ok=True)
JAR, VS = f"{WD}/jar.pkl", f"{WD}/vs.txt"
CAPIMG = f"{WD}/captcha.png"
OCRCAP = f"{WD}/captcha_ocr.png"
SHOTIMG = f"{WD}/attendance.png"

_orig = socket.getaddrinfo
def _pinned(host, *a, **k):
    return _orig(PIN, *a, **k) if host == "erp.tcetmumbai.in" else _orig(host, *a, **k)
socket.getaddrinfo = _pinned

def opener():
    cj = http.cookiejar.CookieJar()
    try:
        for c in pickle.load(open(JAR, "rb")):
            cj.set_cookie(c)
    except FileNotFoundError:
        pass
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
    op.addheaders = [("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")]
    return op, cj

def save(cj):
    pickle.dump(list(cj), open(JAR, "wb"))

def fetch():
    os.path.exists(JAR) and os.remove(JAR)
    op, cj = opener()
    html = op.open(LOGIN, timeout=25).read().decode("utf-8", "replace")
    vs = re.search(r'id="__VIEWSTATE" value="([^"]*)"', html).group(1)
    vsg = re.search(r'id="__VIEWSTATEGENERATOR" value="([^"]*)"', html).group(1)
    open(VS, "w").write(vs + "\n" + vsg)
    req = urllib.request.Request(LOGIN + "/funGenerateCaptcha", data=b"",
        headers={"Content-Type": "application/json; charset=utf-8"})
    img = json.loads(op.open(req, timeout=25).read().decode())["d"]
    open(CAPIMG, "wb").write(base64.b64decode(img))
    save(cj)
    print(f"captcha -> {CAPIMG} | then: {sys.argv[0]} login <captcha>")

def login(cap):
    op, cj = opener()
    vs, vsg = open(VS).read().split("\n")[:2]
    data = urllib.parse.urlencode({
        "__EVENTTARGET": "btnLogin", "__EVENTARGUMENT": "",
        "__VIEWSTATE": vs, "__VIEWSTATEGENERATOR": vsg,
        "hdnMsg": "", "hdtype": "", "hdloginid": "", "hdnFlag": "R", "hdnWCCSOTP": "",
        "txtUserId": USER, "txtPassword": PW, "txtCaptcha": cap,
    })
    body = op.open(urllib.request.Request(LOGIN, data=data.encode()), timeout=25).read().decode("utf-8", "replace")
    msg = (re.search(r'id="hdnMsg" value="([^"]*)"', body) or [None, ""])[1]
    save(cj)
    if "Mismatch" in msg:
        print("LOGIN FAILED:", msg); sys.exit(1)
    if msg:
        print("auth OK (expected crash):", msg)
    else:
        print("WARN: no hdnMsg in response; continuing — verify report output")

def report():
    rows = _rows()
    for cells in rows:
        print(" | ".join(cells))

def _rows():
    op, cj = opener()
    body = op.open(REPORT, timeout=25).read().decode("utf-8", "replace")
    if "txtUserId" in body and "txtCaptcha" in body:
        print("NOT AUTHENTICATED — redo fetch + login"); sys.exit(1)
    body = re.sub(r"<script.*?</script>", " ", body, flags=re.S)
    rows = []
    for r in re.findall(r"<tr[^>]*>(.*?)</tr>", body, flags=re.S):
        cells = [re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", c)).strip()
                 for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", r, flags=re.S)]
        cells = [c for c in cells if c]
        if cells:
            rows.append(cells)
    return rows

def shot():
    from PIL import Image, ImageDraw, ImageFont
    rows = _rows()
    period = next((r for r in rows if r and r[0].startswith("Period")), [])
    data = [r for r in rows if len(r) >= 3 and r[0] != "SrNo" and not r[0].startswith("Period")]
    W, ROWH, PAD = 1000, 44, 14
    TITLE = 72
    F = lambda p, s: ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans%s.ttf" % p, s)
    f_big, f_sub, f_hdr, f_bold, f_body = F("-Bold", 22), F("", 15), F("-Bold", 17), F("-Bold", 17), F("", 17)
    cols = [40, 380, 130, 110, 140, 200]
    x0 = PAD
    img = Image.new("RGB", (W, TITLE + ROWH * (len(data) + 1) + 40), "white")
    d = ImageDraw.Draw(img)
    d.text((PAD, 10), "TCET ERP — Attendance (SelfAttendence.aspx)", font=f_big, fill="#1a1a2e")
    d.text((PAD, 42), " | ".join(period), font=f_sub, fill="#555")
    y = TITLE
    def row(cells, y, bg, fg, fnt):
        d.rectangle([0, y, W, y + ROWH], fill=bg)
        x = x0
        for i, c in enumerate(cells):
            d.text((x + 8, y + 10), c, font=fnt, fill=fg)
            x += cols[i] if i < len(cols) else 160
        return y + ROWH
    y = row(["SrNo", "Subject", "Subject Type", "Present", "Total Period", "Percentage"], y, "#1a1a2e", "white", f_hdr)
    for i, cells in enumerate(data):
        bg = "#f4f6fa" if i % 2 else "white"
        is_sum = cells[0] in ("Theory", "Practical", "Tutorial", "Total")
        cells = cells if len(cells) == 6 else [""] + cells
        y = row(cells, y, "#e8edf5" if is_sum else bg, "#111" if not is_sum else "#0b3d91",
                f_bold if is_sum else f_body)
    d.line([0, y, W, y], fill="#1a1a2e", width=3)
    img.save(SHOTIMG)
    print(SHOTIMG)

def _read_captcha(eng, cap_path):
    """Try 3 preprocessing variants of the captcha (grayscale-3x, binarized,
    inverted-binarized) and return the best read. Noisy ERP captchas often
    lose characters under one threshold but read cleanly under another —
    the known-good account reads at conf ~0.99, hard draws at 0.6-0.7."""
    from PIL import Image, ImageOps
    base = Image.open(cap_path).convert("L")
    w, h = base.size
    variants = []
    g = base.resize((w * 3, h * 3), Image.LANCZOS)
    variants.append(g)
    variants.append(g.point(lambda p: 255 if p > 128 else 0))
    variants.append(ImageOps.invert(g).point(lambda p: 255 if p > 128 else 0))
    best = None
    for v in variants:
        v.save(OCRCAP)
        res, _ = eng(OCRCAP)
        if not res:
            continue
        txt = "".join(re.findall(r"[0-9A-Za-z]", "".join(r[1] for r in res)))
        conf = sum(float(r[2]) for r in res) / len(res)
        if best is None or conf > best[1]:
            best = (txt, conf)
        if len(txt) in (5, 6) and conf >= 0.6:
            return txt, conf
    if best is None:
        raise RuntimeError("OCR_FAIL")
    return best

def fast():
    """One-shot: fetch -> local OCR captcha -> login -> print rows + render PNG.
    Self-retrying: the ERP (IIS) is flaky (M6) — transient 404s, POST timeouts that
    burn the single-use captcha. Every attempt restarts fresh (new session+captcha)."""
    from rapidocr_onnxruntime import RapidOCR
    eng = RapidOCR()
    for attempt in range(1, 5):
        try:
            fetch()
            txt, conf = _read_captcha(eng, CAPIMG)
            if len(txt) not in (5, 6) or conf < 0.6:
                raise RuntimeError(f"OCR_UNSURE {txt!r} conf={conf:.2f}")
            print(f"OCR: {txt} conf={conf:.2f}")
            try:
                login(txt)
            except SystemExit:
                raise RuntimeError("LOGIN FAILED (mismatch)")
            rows = _rows()
            if not any(r for r in rows if r and re.match(r"^\d+$", r[0])):
                raise RuntimeError("EMPTY_REPORT (captcha misread)")
            for cells in rows:
                print(" | ".join(cells))
            shot()
            print("OK")
            return
        except (Exception, SystemExit) as e:
            # SystemExit caught only from login()/NOT-AUTH exits — they mean "retry fresh"
            print(f"attempt {attempt}/4 failed: {e}")
            if attempt < 4:
                time.sleep(3)
    print("ALL_ATTEMPTS_FAILED — ERP flaky; retry later")
    sys.exit(2)

def probe():
    """Single-attempt credential check (used by the save-password API):
    fetch → OCR → login → exit 0 on success, 3 on password/captcha rejection,
    4 on transient ERP failure. The API reads the raw hdnMsg from stdout."""
    from rapidocr_onnxruntime import RapidOCR
    eng = RapidOCR()
    try:
        fetch()
        txt, conf = _read_captcha(eng, CAPIMG)
        print(f"OCR: {txt} conf={conf:.2f}")
        try:
            login(txt)
        except SystemExit:
            sys.exit(3)  # login() already printed the server message
        print("OK")
    except SystemExit:
        raise
    except Exception as e:
        print(f"PROBE_FAIL: {e}")
        sys.exit(4)

if __name__ == "__main__":
    {"fetch": fetch, "login": lambda: login(sys.argv[2]), "report": report, "shot": shot, "fast": fast, "probe": probe}[_args.mode]()
