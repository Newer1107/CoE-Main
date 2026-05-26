"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface FacultyProfile {
  id: number;
  userId: number;
  department: string | null;
  designation: string | null;
  expertise: string | null;
  resumeUrl: string | null;
  resumeFileName: string | null;
  profileLinks: string[];
  isComplete: boolean;
  updatedAt: string;
}

const validateLinks = (links: string[]) => {
  const invalid = links.filter((link) => {
    try {
      const url = new URL(link);
      return url.protocol !== "http:" && url.protocol !== "https:";
    } catch {
      return true;
    }
  });

  return invalid;
};

export default function FacultyProfileClient() {
  const [profile, setProfile] = useState<FacultyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    department: "",
    designation: "",
    expertise: "",
    resume: null as File | null,
    links: [""],
  });

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await fetch("/api/faculty/profile");
        if (res.ok) {
          const data = await res.json();
          const profileData = data.data as FacultyProfile;
          setProfile(profileData);
          setFormData({
            department: profileData.department || "",
            designation: profileData.designation || "",
            expertise: profileData.expertise || "",
            resume: null,
            links: profileData.profileLinks?.length ? profileData.profileLinks : [""],
          });
        } else if (res.status === 404) {
          setProfile(null);
        } else {
          setError("Failed to load profile");
        }
      } catch (err) {
        setError("Error loading profile");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, []);

  const updateLink = (index: number, value: string) => {
    setFormData((prev) => {
      const nextLinks = [...prev.links];
      nextLinks[index] = value;
      return { ...prev, links: nextLinks };
    });
  };

  const addLink = () => {
    setFormData((prev) => ({ ...prev, links: [...prev.links, ""] }));
  };

  const removeLink = (index: number) => {
    setFormData((prev) => {
      const nextLinks = prev.links.filter((_, idx) => idx !== index);
      return { ...prev, links: nextLinks.length > 0 ? nextLinks : [""] };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!formData.department.trim() || !formData.designation.trim() || !formData.expertise.trim()) {
      setError("Please fill in all required fields");
      return;
    }

    if (!profile && !formData.resume) {
      setError("Resume is required when creating a profile");
      return;
    }

    const cleanedLinks = formData.links.map((link) => link.trim()).filter(Boolean);
    const invalidLinks = validateLinks(cleanedLinks);
    if (invalidLinks.length > 0) {
      setError("Please remove or fix invalid profile URLs");
      return;
    }

    try {
      setSaving(true);
      const form = new FormData();
      form.append("department", formData.department.trim());
      form.append("designation", formData.designation.trim());
      form.append("expertise", formData.expertise.trim());
      form.append("profileLinks", JSON.stringify(cleanedLinks));
      if (formData.resume) {
        form.append("resume", formData.resume);
      }

      const method = profile ? "PATCH" : "POST";
      const res = await fetch("/api/faculty/profile", {
        method,
        body: form,
      });

      if (!res.ok) {
        const errorData = await res.json();
        setError(errorData.message || "Failed to save profile");
        return;
      }

      const data = await res.json();
      setProfile(data.data);
      setSuccess(true);
      setFormData((prev) => ({
        ...prev,
        resume: null,
        links: cleanedLinks.length ? cleanedLinks : [""],
      }));
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError("Error saving profile");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="max-w-7xl mx-auto mt-10 px-4 md:px-8 pt-[120px] pb-14 min-h-screen">
        <div className="text-center text-[#434651]">Loading profile...</div>
      </main>
    );
  }

  return (
    <main className="max-w-7xl mx-auto mt-10 px-4 md:px-8 pt-[120px] pb-14 min-h-screen">
      <header className="mb-8 border-l-4 border-[#002155] pl-4 md:pl-6">
        <h1 className="font-headline text-3xl md:text-[40px] font-bold tracking-tight text-[#002155] leading-none">
          Faculty Profile
        </h1>
        <p className="mt-2 text-[#434651] max-w-3xl font-body text-sm">
          Capture your department, designation, expertise, and resume once. This profile is reused across faculty workflows.
        </p>
      </header>

      <div className="max-w-2xl space-y-6">
        {error && (
          <div className="p-4 bg-red-50 border-l-4 border-red-500 text-red-800 text-sm rounded">
            <p className="font-medium">{error}</p>
          </div>
        )}

        {success && (
          <div className="p-4 bg-green-50 border-l-4 border-green-500 text-green-800 text-sm rounded">
            <p className="font-medium">Profile saved successfully.</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6 bg-white border border-[#c4c6d3] p-6 md:p-8">
          <div>
            <label className="block text-sm font-medium text-[#002155] mb-2">
              Department <span className="text-red-500">*</span>
            </label>
            <input
              value={formData.department}
              onChange={(e) => setFormData({ ...formData, department: e.target.value })}
              placeholder="e.g., Computer Engineering"
              className="w-full p-3 border border-[#c4c6d3] rounded text-[#434651] placeholder-[#747782] focus:outline-none focus:border-[#fd9923] focus:ring-1 focus:ring-[#fd9923]/50 text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#002155] mb-2">
              Designation <span className="text-red-500">*</span>
            </label>
            <input
              value={formData.designation}
              onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
              placeholder="e.g., Assistant Professor"
              className="w-full p-3 border border-[#c4c6d3] rounded text-[#434651] placeholder-[#747782] focus:outline-none focus:border-[#fd9923] focus:ring-1 focus:ring-[#fd9923]/50 text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#002155] mb-2">
              Areas of Expertise <span className="text-red-500">*</span>
            </label>
            <textarea
              value={formData.expertise}
              onChange={(e) => setFormData({ ...formData, expertise: e.target.value })}
              placeholder="e.g., AI, Machine Learning, IoT, Embedded Systems"
              className="w-full p-3 border border-[#c4c6d3] rounded text-[#434651] placeholder-[#747782] focus:outline-none focus:border-[#fd9923] focus:ring-1 focus:ring-[#fd9923]/50 text-sm"
              rows={3}
              required
            />
            <p className="text-xs text-[#747782] mt-1">Comma-separated list of skills or research areas</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#002155] mb-2">
              Resume / CV {!profile && <span className="text-red-500">*</span>}
            </label>
            <input
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={(e) => setFormData({ ...formData, resume: e.target.files?.[0] || null })}
              className="w-full p-3 border border-[#c4c6d3] rounded text-[#434651] text-sm"
            />
            <p className="text-xs text-[#747782] mt-1">PDF, DOC, or DOCX format (Max 10MB)</p>
            {profile?.resumeFileName && (
              <p className="text-xs text-green-600 mt-2">
                Resume uploaded: {profile.resumeFileName}{formData.resume && " (will be replaced)"}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-[#002155] mb-2">Professional Profile Links</label>
            <div className="space-y-2">
              {formData.links.map((link, index) => (
                <div key={`${index}-link`} className="flex gap-2">
                  <input
                    value={link}
                    onChange={(e) => updateLink(index, e.target.value)}
                    placeholder="https://linkedin.com/in/your-name"
                    className="flex-1 p-3 border border-[#c4c6d3] rounded text-[#434651] placeholder-[#747782] focus:outline-none focus:border-[#fd9923] focus:ring-1 focus:ring-[#fd9923]/50 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => removeLink(index)}
                    className="px-3 py-2 border border-[#c4c6d3] text-xs font-bold uppercase text-[#434651]"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addLink}
              className="mt-3 px-4 py-2 text-xs font-bold uppercase tracking-wider border border-[#002155] text-[#002155]"
            >
              Add another link
            </button>
            <p className="text-xs text-[#747782] mt-1">Include LinkedIn, Google Scholar, or portfolio URLs</p>
          </div>

          <div className="flex gap-3 pt-4 border-t border-[#c4c6d3]">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 bg-[#fd9923] text-white rounded font-medium hover:bg-[#e68a00] disabled:opacity-50 transition-colors text-sm"
            >
              {saving ? "Saving..." : "Save Profile"}
            </button>
            <Link
              href="/faculty"
              className="px-6 py-2.5 bg-[#efeeea] text-[#434651] rounded font-medium hover:bg-[#e0ded8] transition-colors text-sm"
            >
              Back
            </Link>
          </div>
        </form>

        {profile?.isComplete && (
          <div className="p-4 bg-green-50 border-l-4 border-[#0b6b2e] rounded">
            <p className="text-sm text-[#0b6b2e] font-medium">
              Your faculty profile is complete.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
