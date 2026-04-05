import React from 'react';

const Input = ({ 
  label, 
  error, 
  className = '', 
  containerClassName = '',
  ...props 
}) => {
  return (
    <div className={`flex flex-col gap-1.5 ${containerClassName}`}>
      {label && (
        <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
          {label}
        </label>
      )}
      <input
        className={`px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-all ${error ? 'border-red-500' : ''} ${className}`}
        {...props}
      />
      {error && (
        <span className="text-xs text-red-500 dark:text-red-400">{error}</span>
      )}
    </div>
  );
};

export default Input;