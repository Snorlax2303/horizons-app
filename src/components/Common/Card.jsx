import React from 'react';
import { motion } from 'framer-motion';

const Card = ({ children, className = '', hover = false, onClick }) => {
  return (
    <motion.div
      className={`bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 ${hover ? 'cursor-pointer' : ''} ${className}`}
      whileHover={hover ? { y: -4, boxShadow: '0 10px 30px rgba(0,0,0,0.1)' } : {}}
      transition={{ duration: 0.2 }}
      onClick={onClick}
    >
      {children}
    </motion.div>
  );
};

export default Card;