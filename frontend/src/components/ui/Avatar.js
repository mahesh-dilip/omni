import React from 'react';

const Avatar = ({ 
  src, 
  alt, 
  fallback, 
  className = '',
  ...props 
}) => {
  const [error, setError] = React.useState(false);

  return (
    <div
      className={`
        relative flex h-8 w-8 shrink-0 overflow-hidden rounded-full
        ${className}
      `}
      {...props}
    >
      {src && !error ? (
        <img
          src={src}
          alt={alt}
          className="aspect-square h-full w-full object-cover"
          onError={() => setError(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-blue-100 text-blue-600 text-sm font-medium">
          {fallback}
        </div>
      )}
    </div>
  );
};

export default Avatar; 