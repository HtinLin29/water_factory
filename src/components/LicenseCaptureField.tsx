'use client';

import { useEffect, useRef, useState } from 'react';
import { useAppPreferences } from '@/contexts/AppPreferencesContext';

interface LicenseCaptureFieldProps {
  label: string;
  hint?: string;
  onChange: (file: File | null) => void;
}

export default function LicenseCaptureField({ label, hint, onChange }: LicenseCaptureFieldProps) {
  const { t } = useAppPreferences();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [showCamera, setShowCamera] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  useEffect(() => {
    if (showCamera && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [showCamera]);

  function setFile(file: File | null) {
    if (preview) URL.revokeObjectURL(preview);
    if (!file) {
      setPreview(null);
      setFileName('');
      onChange(null);
      return;
    }
    setFileName(file.name);
    if (file.type.startsWith('image/')) {
      setPreview(URL.createObjectURL(file));
    } else {
      setPreview(null);
    }
    onChange(file);
  }

  async function openCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      cameraInputRef.current?.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      setShowCamera(true);
    } catch {
      cameraInputRef.current?.click();
    }
  }

  function closeCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setShowCamera(false);
  }

  function capturePhoto() {
    const video = videoRef.current;
    if (!video) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `license-${Date.now()}.jpg`, { type: 'image/jpeg' });
        setFile(file);
        closeCamera();
      },
      'image/jpeg',
      0.92
    );
  }

  return (
    <div>
      <label className="block text-sm font-medium mb-1">
        {label}
        {hint && <span className="text-muted font-normal"> {hint}</span>}
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={openCamera} className="btn-secondary text-sm">
          {t('drivers_takePhoto')}
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="btn-secondary text-sm"
        >
          {t('drivers_chooseFile')}
        </button>
        {fileName && (
          <button type="button" onClick={() => setFile(null)} className="text-sm text-red-600 hover:underline">
            {t('remove')}
          </button>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.pdf"
        className="hidden"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      {fileName && <p className="text-xs text-muted mt-1">{fileName}</p>}
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt={label}
          className="mt-2 h-24 w-auto rounded-lg border border-slate-200 dark:border-slate-700 object-cover"
        />
      )}

      {showCamera && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
            <video ref={videoRef} autoPlay playsInline className="w-full bg-black aspect-video" />
            <div className="flex gap-2 p-4">
              <button type="button" onClick={capturePhoto} className="btn-primary flex-1">
                {t('drivers_capture')}
              </button>
              <button type="button" onClick={closeCamera} className="btn-secondary">
                {t('cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
