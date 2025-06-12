import React, { useState } from 'react';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { auth } from '../firebase';

export default function LoginPage() {
  const [isLoginView, setIsLoginView] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);

  const handleAuthSubmit = (e) => {
    e.preventDefault();
    setError(null);
    if(isLoginView) {
      signInWithEmailAndPassword(auth, email, password).catch(err => setError(err.message));
    } else {
      createUserWithEmailAndPassword(auth, email, password).catch(err => setError(err.message));
    }
  };

  return (
    <div className="flex items-center justify-center h-screen bg-gray-100 font-sans">
      <div className="p-8 bg-white rounded-lg shadow-md w-full max-w-sm">
        <h2 className="text-2xl font-bold mb-6 text-center text-gray-800">
          {isLoginView ? 'Welcome Back' : 'Create Account'}
        </h2>
        <form onSubmit={handleAuthSubmit}>
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="email">Email</label>
            <input 
              type="email" 
              id="email" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" 
              placeholder="you@example.com"
            />
          </div>
          <div className="mb-6">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="password">Password</label>
            <input 
              type="password" 
              id="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 mb-3 leading-tight focus:outline-none focus:shadow-outline" 
              placeholder="******************"
            />
          </div>
          {error && <p className="text-red-500 text-xs italic mb-4">{error}</p>}
          <div className="flex items-center justify-between">
            <button 
              type="submit" 
              className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline w-full"
            >
              {isLoginView ? 'Sign In' : 'Sign Up'}
            </button>
          </div>
        </form>
        <p className="text-center text-gray-500 text-xs mt-6">
          <button 
            onClick={(e) => { 
              e.preventDefault(); 
              setIsLoginView(!isLoginView); 
              setError(null);
            }} 
            className="text-blue-500 hover:text-blue-800"
          >
            {isLoginView ? 'Need an account? Sign Up' : 'Already have an account? Sign In'}
          </button>
        </p>
      </div>
    </div>
  );
} 