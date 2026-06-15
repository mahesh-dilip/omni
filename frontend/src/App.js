import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from 'firebase/auth';
import { getAnalytics } from 'firebase/analytics';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  query, 
  where, 
  onSnapshot,
  orderBy,
  serverTimestamp
} from 'firebase/firestore';
import { 
  getStorage, 
  ref, 
  uploadBytesResumable, 
  getDownloadURL 
} from 'firebase/storage';
import './App.css';

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const analytics = getAnalytics(app);

// --- Config ---
const API_URL = "http://localhost:3001"; // URL of our local backend

// --- Helper Components ---
const PortfolioCard = ({ title, value, detail }) => (
    <div className="bg-white p-4 rounded-lg shadow">
        <h3 className="text-sm font-medium text-gray-500">{title}</h3>
        <p className="mt-1 text-3xl font-semibold text-gray-900">{value}</p>
        <p className="text-sm text-gray-500">{detail}</p>
    </div>
);

const InventoryItemCard = ({ item }) => {
    const valueDisplay = item.is_trackable 
        ? `$${item.estimated_value}` 
        : '--';
    
    let statusPill;
    switch (item.status) {
        case 'processing':
            statusPill = <span className="absolute top-2 right-2 text-xs bg-yellow-100 text-yellow-800 font-medium px-2 py-1 rounded-full">Processing...</span>;
            break;
        case 'analyzed':
             statusPill = <span className="absolute top-2 right-2 text-xs bg-green-100 text-green-800 font-medium px-2 py-1 rounded-full">{item.category}</span>;
            break;
        case 'error':
             statusPill = <span className="absolute top-2 right-2 text-xs bg-red-100 text-red-800 font-medium px-2 py-1 rounded-full">Error</span>;
            break;
        default:
            statusPill = null;
    }

    return (
        <div className="bg-white rounded-lg shadow-md overflow-hidden transform hover:-translate-y-1 transition-transform duration-300 relative">
            {statusPill}
            <img src={item.imageUrl} alt={item.name} className="w-full h-40 object-cover"/>
            <div className="p-3">
                <h3 className="font-semibold text-gray-800 truncate">{item.name}</h3>
                <div className="flex justify-between items-center mt-2">
                    <p className="text-xl font-bold text-blue-600">{valueDisplay}</p>
                    <p className="text-xs text-gray-400">{item.is_trackable ? "Tracked Value" : "Not Tracked"}</p>
                </div>
            </div>
        </div>
    );
};

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isLoginView, setIsLoginView] = useState(true);
  
  // State for login/signup forms
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);

  // State for Inventory
  const [inventory, setInventory] = useState([]);
  const [itemName, setItemName] = useState('');
  const [itemDesc, setItemDesc] = useState('');
  const [itemCategory, setItemCategory] = useState('');
  const [itemImageFile, setItemImageFile] = useState(null);
  const [itemImagePreview, setItemImagePreview] = useState('');
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stage, setStage] = useState('upload');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      const q = query(collection(db, "items"), where("owner", "==", user.uid), orderBy("createdAt", "desc"));
      
      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const itemsData = [];
        querySnapshot.forEach((doc) => {
          itemsData.push({ ...doc.data(), id: doc.id });
        });
        setInventory(itemsData);
      });

      return () => unsubscribe();
    }
  }, [user]);

  // --- Calculate portfolio stats ---
  const portfolioStats = useMemo(() => {
    if (inventory.length === 0) {
        return { totalValue: 0, trackedItems: 0, mostValuable: null };
    }
    const tracked = inventory.filter(item => item.is_trackable && item.status === 'analyzed');
    const totalValue = tracked.reduce((sum, item) => sum + item.estimated_value, 0);
    const mostValuable = tracked.length > 0 
        ? tracked.reduce((max, item) => item.estimated_value > max.estimated_value ? item : max, tracked[0])
        : null;

    return {
        totalValue: totalValue.toFixed(2),
        trackedItems: tracked.length,
        mostValuable: mostValuable ? `${mostValuable.name} ($${mostValuable.estimated_value})` : 'N/A'
    };
  }, [inventory]);

  const handleAuthSubmit = (e) => {
    e.preventDefault();
    setError(null);
    if(isLoginView) {
        signInWithEmailAndPassword(auth, email, password).catch(err => setError(err.message));
    } else {
        createUserWithEmailAndPassword(auth, email, password).catch(err => setError(err.message));
    }
  };

  const handleLogout = async () => signOut(auth).catch(err => console.error("Logout error:", err));

  const resetForm = () => {
    setStage('upload');
    setItemName('');
    setItemDesc('');
    setItemCategory('');
    setItemImageFile(null);
    setItemImagePreview('');
    setFormError('');
    setIsSubmitting(false);
    // Safely reset the file input if it exists
    const fileInput = document.getElementById('itemImageInput');
    if (fileInput) {
      fileInput.value = null;
    }
  };

  // --- Stage 1: Identify Image via Local Backend ---
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
      setFormError('Please upload an image file');
      return;
    }

    // Validate file size (e.g., max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setFormError('Image size should be less than 5MB');
      return;
    }

    setItemImageFile(file);
    setItemImagePreview(URL.createObjectURL(file));
    setStage('identifying');
    setFormError('');
    
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
      const base64 = reader.result.split(',')[1];
      try {
        const token = await user.getIdToken();
        const response = await fetch(`${API_URL}/api/identify`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ imageBase64: base64, mimeType: file.type })
        });

        if (!response.ok) {
            throw new Error('Failed to identify image.');
        }

        const { name, description, category } = await response.json();
        setItemName(name);
        setItemDesc(description);
        setItemCategory(category);
        setStage('confirm');
      } catch (err) {
        console.error('Error identifying image:', err);
        setFormError("Could not identify image. Please enter details manually.");
        setStage('confirm');
      }
    };
  };

  // --- Stage 2: Final Submission ---
  const handleFinalSubmit = async (e) => {
    e.preventDefault();
    if (!itemName || !itemImageFile) {
      setFormError("Item name and image are required.");
      return;
    }
    
    setIsSubmitting(true);
    setFormError('');

    try {
      const storageRef = ref(storage, `images/${user.uid}/${Date.now()}_${itemImageFile.name}`);
      const uploadTask = uploadBytesResumable(storageRef, itemImageFile);
      
      uploadTask.on('state_changed',
        (snapshot) => {
          // Progress monitoring if needed
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          console.log('Upload progress:', progress);
        },
        (error) => {
          console.error('Upload error:', error);
          setFormError("Failed to upload image. Please try again.");
          setIsSubmitting(false);
        },
        async () => {
          try {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            // 1. Add item to Firestore with initial status
            const docRef = await addDoc(collection(db, "items"), {
              name: itemName,
              description: itemDesc,
              category: itemCategory,
              imageUrl: downloadURL,
              owner: user.uid,
              createdAt: serverTimestamp(),
              status: 'processing_valuation',
            });
            
            // 2. Immediately call our local backend to start the valuation
            const token = await user.getIdToken();
            await fetch(`${API_URL}/api/value`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ 
                  itemId: docRef.id, 
                  name: itemName, 
                  description: itemDesc, 
                  category: itemCategory 
                })
            });
            
            resetForm();
          } catch (error) {
            console.error('Error saving item:', error);
            setFormError("Failed to save item. Please try again.");
            setIsSubmitting(false);
          }
        }
      );
    } catch (error) {
      console.error('Error in submission:', error);
      setFormError("An unexpected error occurred. Please try again.");
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-screen bg-gray-100">Loading...</div>;
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100 font-sans">
        <div className="p-8 bg-white rounded-lg shadow-md w-full max-w-sm">
          <h2 className="text-2xl font-bold mb-6 text-center text-gray-800">{isLoginView ? 'Welcome Back' : 'Create Account'}</h2>
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

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
       <header className="bg-white shadow-sm sticky top-0 z-10">
            <nav className="container mx-auto px-6 py-4 flex justify-between items-center">
                <h1 className="text-xl font-bold text-gray-800">Omni</h1>
                <div>
                    <span className="text-gray-700 mr-4">Welcome, {user.email}</span>
                    <button 
                      onClick={handleLogout} 
                      className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
                    >
                      Logout
                    </button>
                </div>
            </nav>
       </header>
       <main className="container mx-auto p-6">
            {/* Portfolio Section */}
            <div className="mb-8">
                <h2 className="text-2xl font-semibold mb-4 text-gray-800">Your Portfolio</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <PortfolioCard title="Total Estimated Value" value={`$${portfolioStats.totalValue}`} detail={`${portfolioStats.trackedItems} tracked items`} />
                    <PortfolioCard title="Total Items" value={inventory.length} detail={`${inventory.length - portfolioStats.trackedItems} untracked`} />
                    <PortfolioCard title="Most Valuable Item" value={portfolioStats.mostValuable || 'N/A'} detail="Based on tracked items" />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1">
                    <div className="bg-white p-6 rounded-lg shadow-md sticky top-24">
                        <h2 className="text-xl font-semibold mb-4 text-gray-800">Add New Item</h2>
                        
                        {stage === 'upload' && (
                            <label htmlFor="itemImageInput" className="w-full flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg cursor-pointer hover:bg-gray-50">
                                <span className="mt-2 text-sm text-gray-600">Click to upload an image</span>
                                <input id="itemImageInput" type="file" className="hidden" accept="image/*" onChange={handleImageUpload}/>
                            </label>
                        )}

                        {stage === 'identifying' && (
                            <div className="text-center p-8"><p className="mt-4 text-gray-600">Analyzing your image...</p></div>
                        )}

                        {stage === 'confirm' && (
                            <form onSubmit={handleFinalSubmit}>
                                <img src={itemImagePreview} alt="Preview" className="w-full h-48 object-cover rounded-lg mb-4"/>
                                <div className="mb-4">
                                    <label className="block text-gray-700 text-sm font-bold mb-2">Item Name</label>
                                    <input type="text" value={itemName} onChange={(e) => setItemName(e.target.value)} className="shadow-sm border rounded w-full py-2 px-3" required/>
                                </div>
                                <div className="mb-4">
                                    <label className="block text-gray-700 text-sm font-bold mb-2">Category</label>
                                    <select value={itemCategory} onChange={(e) => setItemCategory(e.target.value)} className="shadow-sm border rounded w-full py-2 px-3">
                                        {["Electronics", "Tools & Hardware", "Clothing & Accessories", "Books & Media", "Collectibles & Art", "Kitchen & Home", "Sports & Outdoors", "Musical Instruments", "Health & Beauty", "Toys & Games", "Other"].map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div className="mb-4">
                                    <label className="block text-gray-700 text-sm font-bold mb-2">Description</label>
                                    <textarea value={itemDesc} onChange={(e) => setItemDesc(e.target.value)} className="shadow-sm border rounded w-full py-2 px-3" rows="3"></textarea>
                                </div>
                                {formError && <p className="text-red-500 text-xs mb-4">{formError}</p>}
                                <div className="flex space-x-2">
                                    <button type="button" onClick={resetForm} className="w-1/3 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded">Cancel</button>
                                    <button type="submit" disabled={isSubmitting} className="w-2/3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold py-2 px-4 rounded">
                                        {isSubmitting ? 'Adding...' : 'Confirm & Add Item'}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>

                <div className="lg:col-span-2">
                    <h2 className="text-2xl font-semibold mb-4 text-gray-800">Your Inventory</h2>
                    {inventory.length === 0 ? <p className="text-gray-500">Add your first item to see it here!</p> : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {inventory.map(item => <InventoryItemCard key={item.id} item={item} />)}
                        </div>
                    )}
                </div>
            </div>
       </main>
    </div>
  );
}

export default App;
