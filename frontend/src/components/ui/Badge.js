import React from 'react';

const Badge = ({ 
  children, 
  variant = 'default', 
  className = '',
  ...props 
}) => {
  const variants = {
    default: 'bg-blue-100 text-blue-800',
    secondary: 'bg-gray-100 text-gray-800',
    outline: 'border border-gray-200 text-gray-600',
    success: 'bg-green-100 text-green-800',
    destructive: 'bg-red-100 text-red-800'
  };

  return (
    <span
      className={`
        inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
        ${variants[variant]}
        ${className}
      `}
      {...props}
    >
      {children}
    </span>
  );
};

export default Badge; 