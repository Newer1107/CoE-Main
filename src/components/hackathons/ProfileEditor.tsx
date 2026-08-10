'use client';

import { useState, useEffect } from 'react';

interface StudentProfile {
  id: number;
  userId: number;
  skills: string | null;
  experience: string | null;
  interests: string | null;
  resumeUrl: string | null;
  resumeFileName: string | null;
  isComplete: boolean;
  updatedAt: string;
}

// Single profile editor for the portal hub. Lives here so /hackathons/portal
// (the one "my profile" surface) owns the student profile; the standalone
// /profile page is a redirect.
export default function ProfileEditor() {
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    skills: '',
    experience: '',
    interests: '',
    resume: null as File | null,
  });

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await fetch('/api/profile');
        if (res.ok) {
          const data = await res.json();
          setProfile(data.data);
          setFormData({
            skills: data.data.skills || '',
            experience: data.data.experience || '',
            interests: data.data.interests || '',
            resume: null,
          });
        } else if (res.status === 404) {
          setProfile(null);
        } else {
          setError('Failed to load profile');
        }
      } catch (err) {
        setError('Error loading profile');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!formData.skills.trim() || !formData.experience.trim() || !formData.interests.trim()) {
      setError('Please fill in all required fields');
      return;
    }

    if (!profile && !formData.resume) {
      setError('Resume is required when creating a profile');
      return;
    }

    try {
      setSaving(true);
      const form = new FormData();
      form.append('skills', formData.skills.trim());
      form.append('experience', formData.experience.trim());
      form.append('interests', formData.interests.trim());
      if (formData.resume) {
        form.append('resume', formData.resume);
      }

      const method = profile ? 'PATCH' : 'POST';
      const res = await fetch('/api/profile', {
        method,
        body: form,
      });

      if (!res.ok) {
        const errorData = await res.json();
        setError(errorData.message || 'Failed to save profile');
        return;
      }

      const data = await res.json();
      setProfile(data.data);
      setSuccess(true);
      setFormData({ ...formData, resume: null });
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError('Error saving profile');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-center text-on-surface-variant py-8">Loading profile…</div>;
  }

  const daysAgoUpdated = profile?.updatedAt ? Math.floor((Date.now() - new Date(profile.updatedAt).getTime()) / (1000 * 60 * 60 * 24)) : null;
  const isProfileStale = daysAgoUpdated !== null && daysAgoUpdated > 30;

  return (
    <div className="max-w-2xl space-y-6">
      {/* Profile Staleness Warning */}
      {isProfileStale && (
        <div className="p-4 bg-warning/10 border-l-4 border-warning rounded">
          <p className="text-warning font-medium text-sm">
            ⚠️ Your profile was last updated {daysAgoUpdated} days ago. Please review and update your profile.
          </p>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div role="alert" className="p-4 bg-error-container border-l-4 border-error text-on-error-container text-sm rounded">
          <p className="font-medium">{error}</p>
        </div>
      )}

      {/* Success Message */}
      {success && (
        <div aria-live="polite" className="p-4 bg-success-container border-l-4 border-success text-success text-sm rounded">
          <p className="font-medium">✓ Profile saved successfully!</p>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6 bg-white border border-outline-variant p-6 md:p-8">
        {/* Skills */}
        <div>
          <label className="block text-sm font-medium text-primary mb-2">
            Skills <span className="text-red-500">*</span>
          </label>
          <textarea
            value={formData.skills}
            onChange={(e) => setFormData({ ...formData, skills: e.target.value })}
            placeholder="e.g., React, Node.js, Python, Machine Learning"
            className="w-full p-3 border border-outline-variant rounded text-on-surface-variant placeholder-outline focus:outline-none focus:border-secondary-container focus:ring-1 focus:ring-secondary-container/50 text-sm"
            rows={3}
            required
          />
          <p className="text-xs text-outline mt-1">List your technical skills (comma-separated)</p>
        </div>

        {/* Experience */}
        <div>
          <label className="block text-sm font-medium text-primary mb-2">
            Experience <span className="text-red-500">*</span>
          </label>
          <textarea
            value={formData.experience}
            onChange={(e) => setFormData({ ...formData, experience: e.target.value })}
            placeholder="e.g., 2 years as fullstack developer at XYZ company"
            className="w-full p-3 border border-outline-variant rounded text-on-surface-variant placeholder-outline focus:outline-none focus:border-secondary-container focus:ring-1 focus:ring-secondary-container/50 text-sm"
            rows={3}
            required
          />
          <p className="text-xs text-outline mt-1">Summary of your professional/academic experience</p>
        </div>

        {/* Interests */}
        <div>
          <label className="block text-sm font-medium text-primary mb-2">
            Interests <span className="text-red-500">*</span>
          </label>
          <textarea
            value={formData.interests}
            onChange={(e) => setFormData({ ...formData, interests: e.target.value })}
            placeholder="e.g., Web development, AI/ML, Blockchain, Mobile apps"
            className="w-full p-3 border border-outline-variant rounded text-on-surface-variant placeholder-outline focus:outline-none focus:border-secondary-container focus:ring-1 focus:ring-secondary-container/50 text-sm"
            rows={3}
            required
          />
          <p className="text-xs text-outline mt-1">Areas you're interested in</p>
        </div>

        {/* Resume */}
        <div>
          <label className="block text-sm font-medium text-primary mb-2">
            Resume {!profile && <span className="text-red-500">*</span>}
          </label>
          <input
            type="file"
            accept=".pdf,.doc,.docx"
            onChange={(e) => setFormData({ ...formData, resume: e.target.files?.[0] || null })}
            className="w-full p-3 border border-outline-variant rounded text-on-surface-variant text-sm"
          />
          <p className="text-xs text-outline mt-1">PDF, DOC, or DOCX format (Max 10MB)</p>
          {profile?.resumeUrl && (
            <div className="mt-2 p-2 bg-surface-container rounded border border-outline-variant">
              <p className="text-xs text-primary">
                ✓ Current: <span className="font-medium">{profile.resumeFileName || 'resume'}</span>
              </p>
              <p className="text-xs text-secondary mt-1">Last updated: {new Date(profile.updatedAt).toLocaleDateString()}</p>
              {formData.resume && <p className="text-xs text-success mt-1">📎 New file selected (will be replaced)</p>}
            </div>
          )}
        </div>

        {/* Profile Completion Indicator */}
        <div className="border-t pt-4 space-y-3">
          <label className="block text-sm font-medium text-primary">Profile Status</label>
          <div className={`p-3 rounded ${profile?.isComplete ? 'bg-success-container border border-success/40' : 'bg-warning/10 border border-warning/40'}`}>
            <p className={`text-sm font-medium ${profile?.isComplete ? 'text-success' : 'text-warning'}`}>
              {profile?.isComplete ? '✓ Complete' : '❌ Incomplete'}
            </p>
            <p className={`text-xs mt-1 ${profile?.isComplete ? 'text-success' : 'text-warning'}`}>
              {profile?.isComplete ? 'Your profile is complete. You can apply for open problems.' : 'Complete all fields above to start applying.'}
            </p>
          </div>
        </div>

        {/* Form Actions */}
        <div className="flex gap-3 pt-4 border-t border-outline-variant">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 bg-primary text-white rounded font-medium hover:bg-tertiary disabled:opacity-50 transition-colors text-sm"
          >
            {saving ? 'Saving…' : 'Save Profile'}
          </button>
        </div>
      </form>
    </div>
  );
}
