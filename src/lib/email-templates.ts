const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const buildAdminBroadcastEmailHtml = (input: {
  subject: string;
  message: string;
  previewText?: string;
}) => {
  const subject = escapeHtml(input.subject.trim());
  const previewText = escapeHtml((input.previewText || input.subject).trim());
  const message = escapeHtml(input.message.trim()).replace(/\r?\n/g, "<br />");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${subject}</title>
  </head>
  <body style="margin:0;background:#f5f4f0;font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:#1f2a44;">
    <span style="display:none;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;">${previewText}</span>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#f5f4f0;">
      <tr>
        <td align="center" style="padding:24px;">
          <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="width:100%;max-width:640px;border-collapse:collapse;">
            <tr>
              <td style="background:#002155;color:#ffffff;padding:20px 24px;">
                <p style="margin:0;font-size:12px;letter-spacing:2px;text-transform:uppercase;">TCET Centre of Excellence</p>
                <h1 style="margin:10px 0 0;font-size:22px;line-height:1.3;">${subject}</h1>
              </td>
            </tr>
            <tr>
              <td style="background:#ffffff;border:1px solid #d7d5cf;border-top:0;padding:24px;">
                <p style="margin:0 0 16px;font-size:14px;letter-spacing:1px;text-transform:uppercase;color:#8c4f00;">Admin Notification</p>
                <div style="font-size:15px;line-height:1.6;color:#1f2a44;">${message}</div>
                <hr style="border:0;border-top:1px solid #e3e2df;margin:24px 0;" />
                <p style="margin:0;font-size:12px;color:#6b7280;">This message was sent from the CoE admin portal. For support, contact the CoE team.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px;text-align:center;font-size:11px;color:#747782;">
                TCET CoE Portal • Automated email
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
};
