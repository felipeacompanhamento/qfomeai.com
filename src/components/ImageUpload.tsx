import React, { useState, useRef } from 'react';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';
import { Upload, X, Check, AlertCircle, Loader2 } from 'lucide-react';
import imageCompression from 'browser-image-compression';

interface ImageUploadProps {
  onUploadComplete: (url: string) => void;
  path: string;
  label: string;
  currentImageUrl?: string;
  aspectRatio?: 'square' | 'video' | 'banner';
  processProductImage?: boolean;
  isBanner?: boolean;
  isLogo?: boolean;
  isCover?: boolean;
}

export default function ImageUpload({ onUploadComplete, path, label, currentImageUrl, aspectRatio = 'square', processProductImage = false, isBanner = false, isLogo = false, isCover = false }: ImageUploadProps) {
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(currentImageUrl || null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  const maxSize = 5 * 1024 * 1024; // 5MB

  const processImage = (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        // Configuração solicitada: 300x300
        canvas.width = 300;
        canvas.height = 300;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context not found'));
          return;
        }

        // Calculate crop to square
        const size = Math.min(img.width, img.height);
        const offsetX = (img.width - size) / 2;
        const offsetY = (img.height - size) / 2;

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        // Redimensiona para 300x300 mantendo o centro
        ctx.drawImage(img, offsetX, offsetY, size, size, 0, 0, 300, 300);
        
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Canvas toBlob failed'));
          }
        }, 'image/webp', 0.8); // Qualidade 80% em WebP
      };
      img.onerror = reject;
    });
  };

  const processBanner = (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        const maxWidth = 1280;
        const maxHeight = 720;

        const widthRatio = maxWidth / width;
        const heightRatio = maxHeight / height;
        const ratio = Math.min(widthRatio, heightRatio, 1);

        const newWidth = width * ratio;
        const newHeight = height * ratio;

        const canvas = document.createElement('canvas');
        canvas.width = newWidth;
        canvas.height = newHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context not found'));
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, newWidth, newHeight);
        
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Canvas toBlob failed'));
        }, 'image/webp', 0.9);
      };
      img.onerror = reject;
    });
  };

  const processLogo = (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context not found'));
          return;
        }

        // Calculate crop to square
        const size = Math.min(img.width, img.height);
        const offsetX = (img.width - size) / 2;
        const offsetY = (img.height - size) / 2;

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, offsetX, offsetY, size, size, 0, 0, 512, 512);
        
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Canvas toBlob failed'));
        }, 'image/webp', 0.85);
      };
      img.onerror = reject;
    });
  };

  const processCover = (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 1280;
        canvas.height = 720;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context not found'));
          return;
        }

        // Calculate crop to 16:9
        const targetRatio = 1280 / 720;
        const currentRatio = img.width / img.height;
        let sourceWidth, sourceHeight, offsetX, offsetY;

        if (currentRatio > targetRatio) {
          sourceHeight = img.height;
          sourceWidth = img.height * targetRatio;
          offsetX = (img.width - sourceWidth) / 2;
          offsetY = 0;
        } else {
          sourceWidth = img.width;
          sourceHeight = img.width / targetRatio;
          offsetX = 0;
          offsetY = (img.height - sourceHeight) / 2;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, offsetX, offsetY, sourceWidth, sourceHeight, 0, 0, 1280, 720);
        
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Canvas toBlob failed'));
        }, 'image/webp', 0.85);
      };
      img.onerror = reject;
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validation
    if (!allowedTypes.includes(file.type)) {
      setError('Formato inválido. Use JPG, PNG ou WebP.');
      return;
    }

    if (file.size > maxSize) {
      setError('Arquivo muito grande. Máximo 5MB.');
      return;
    }

    setError(null);
    setUploading(true);
    setProgress(0);

    try {
      let fileToUpload: File | Blob = file;

      if (processProductImage) {
        // Processamento para 300x300 WebP 80%
        const processedBlob = await processImage(file);
        const options = {
          maxSizeMB: 0.29, // Limite de 300KB (aprox 0.29MB)
          useWebWorker: true,
          fileType: 'image/webp' as any,
          initialQuality: 0.8
        };
        fileToUpload = await imageCompression(new File([processedBlob], file.name, { type: 'image/webp' }), options);
      } else if (isBanner) {
        // Optimization for banners: max 1280x720, WebP, 80% quality, max 250kb
        const resizedBlob = await processBanner(file);
        const options = {
          maxSizeMB: 0.24, // Max 250kb
          useWebWorker: true,
          fileType: 'image/webp' as any,
          initialQuality: 0.85
        };
        fileToUpload = await imageCompression(new File([resizedBlob], file.name, { type: 'image/webp' }), options);
      } else if (isLogo) {
        // Optimization for logo: 512x512, WebP, 80% quality, max 100kb
        const resizedBlob = await processLogo(file);
        const options = {
          maxSizeMB: 0.09, // Max 100kb
          useWebWorker: true,
          fileType: 'image/webp' as any,
          initialQuality: 0.85
        };
        fileToUpload = await imageCompression(new File([resizedBlob], file.name, { type: 'image/webp' }), options);
      } else if (isCover) {
        // Optimization for cover: 1280x720, WebP, 80% quality, max 200kb
        const resizedBlob = await processCover(file);
        const options = {
          maxSizeMB: 0.19, // Max 200kb
          useWebWorker: true,
          fileType: 'image/webp' as any,
          initialQuality: 0.85
        };
        fileToUpload = await imageCompression(new File([resizedBlob], file.name, { type: 'image/webp' }), options);
      } else {
        // Compress and convert to WebP for other images
        const options = {
          maxSizeMB: 1,
          maxWidthOrHeight: 800,
          useWebWorker: true,
          fileType: 'image/webp',
          initialQuality: 0.75
        };
        fileToUpload = await imageCompression(file, options);
      }

      // Preview local
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(fileToUpload);

      const storageRef = ref(storage, `${path}/${Date.now()}_${file.name.split('.')[0]}.webp`);
      const uploadTask = uploadBytesResumable(storageRef, fileToUpload as Blob);

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const p = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setProgress(p);
        },
        (err) => {
          console.error('Upload error:', err);
          setError('Erro ao enviar imagem. Tente novamente.');
          setUploading(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        },
        async () => {
          try {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            onUploadComplete(downloadURL);
            setUploading(false);
            setProgress(100);
            if (fileInputRef.current) fileInputRef.current.value = '';
          } catch (urlErr) {
            console.error('Error getting download URL:', urlErr);
            setError('Erro ao obter URL da imagem.');
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
          }
        }
      );
    } catch (err) {
      console.error('Upload catch error:', err);
      setError('Erro ao processar imagem. Tente novamente.');
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const aspectClasses = {
    square: 'aspect-square',
    video: 'aspect-video',
    banner: 'aspect-[3/1]'
  };

  return (
    <div className="space-y-2">
      <label className="text-xs font-bold text-stone-400 uppercase tracking-wider">{label}</label>
      
      <div 
        className={`relative group rounded-2xl border-2 border-dashed transition-all overflow-hidden bg-stone-50 ${
          error ? 'border-red-200 bg-red-50' : 
          uploading ? 'border-emerald-200' : 
          'border-stone-200 hover:border-emerald-400'
        } ${aspectClasses[aspectRatio]}`}
      >
        {preview ? (
          <div className="relative w-full h-full group cursor-pointer" onClick={() => !uploading && fileInputRef.current?.click()}>
            <img 
              src={preview} 
              alt="Preview" 
              className={`w-full h-full object-cover transition-opacity ${uploading ? 'opacity-50' : 'opacity-100 group-hover:opacity-75'}`}
              referrerPolicy="no-referrer"
            />
            {!uploading && (
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
                <div className="bg-white/90 text-stone-800 px-3 py-1.5 rounded-full text-xs font-bold shadow-sm flex items-center gap-1">
                  <Upload className="w-3 h-3" />
                  Trocar Imagem
                </div>
              </div>
            )}
            {!uploading && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPreview(null);
                  onUploadComplete(''); // Clear the URL
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                className="absolute top-2 right-2 p-1.5 bg-white/90 text-stone-600 rounded-full shadow-sm hover:bg-red-50 hover:text-red-600 transition-all sm:opacity-0 sm:group-hover:opacity-100"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full h-full flex flex-col items-center justify-center gap-2 text-stone-400 hover:text-emerald-600 transition-colors"
          >
            <Upload className="w-8 h-8" />
            <span className="text-xs font-bold">Clique para upload</span>
            <span className="text-[10px] opacity-60">JPG, PNG ou WebP (Máx 5MB)</span>
          </button>
        )}

        {uploading && (
          <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] flex flex-col items-center justify-center p-4">
            <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mb-2" />
            <div className="w-full max-w-[120px] h-1.5 bg-stone-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-emerald-500 transition-all duration-300" 
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-[10px] font-bold text-emerald-700 mt-2">{Math.round(progress)}%</span>
          </div>
        )}

        {progress === 100 && !uploading && !error && (
          <div className="absolute bottom-2 right-2 bg-emerald-500 text-white p-1 rounded-full shadow-lg">
            <Check className="w-3 h-3" />
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-1.5 text-red-500 text-[10px] font-bold mt-1">
          <AlertCircle className="w-3 h-3" />
          <span>{error}</span>
        </div>
      )}

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
      />
    </div>
  );
}
