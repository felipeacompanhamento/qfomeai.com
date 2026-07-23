import React, { useState } from 'react';
import { Utensils, Store, Image as ImageIcon } from 'lucide-react';

interface PlaceholderImageProps {
  src?: string;
  alt?: string;
  className?: string;
  type: 'produto' | 'logo' | 'capa';
}

export default function PlaceholderImage({ src, alt, className = '', type }: PlaceholderImageProps) {
  const [hasError, setHasError] = useState(false);

  const showPlaceholder = !src || src.trim() === '' || hasError;

  const renderPlaceholder = () => {
    const iconClass = "text-stone-300 opacity-40";
    
    return (
      <div className={`flex items-center justify-center bg-[#F3F3F3] w-full h-full ${className}`}>
        {type === 'produto' && <Utensils className={`${iconClass} w-1/3 h-1/3`} />}
        {type === 'logo' && <Store className={`${iconClass} w-1/2 h-1/2`} />}
        {type === 'capa' && <ImageIcon className={`${iconClass} w-12 h-12`} />}
      </div>
    );
  };

  if (showPlaceholder) {
    return renderPlaceholder();
  }

  return (
    <img 
      src={src} 
      alt={alt || ''} 
      className={className} 
      referrerPolicy="no-referrer"
      onError={() => setHasError(true)}
    />
  );
}
