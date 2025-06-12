import React from 'react';

const Card = ({ className, children, ...props }) => {
  return (
    <div
      className={`bg-white rounded-lg shadow-sm border-0 ${className || ''}`}
      {...props}
    >
      {children}
    </div>
  );
};

const CardHeader = ({ className, children, ...props }) => {
  return (
    <div
      className={`px-6 py-4 border-b border-gray-100 ${className || ''}`}
      {...props}
    >
      {children}
    </div>
  );
};

const CardContent = ({ className, children, ...props }) => {
  return (
    <div
      className={`p-6 ${className || ''}`}
      {...props}
    >
      {children}
    </div>
  );
};

const CardTitle = ({ className, children, ...props }) => {
  return (
    <h3
      className={`text-lg font-semibold text-gray-900 ${className || ''}`}
      {...props}
    >
      {children}
    </h3>
  );
};

export { Card, CardHeader, CardContent, CardTitle }; 