import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { auth, db, storage, API_URL } from '../firebase';
import { collection, addDoc, query, where, onSnapshot, orderBy, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { TrendingUp, Package, Star, Upload, LogOut } from 'lucide-react';
import { Card, CardHeader, CardContent, CardTitle } from '../components/ui';
import { Badge } from '../components/ui';
import { Button } from '../components/ui';
import { Avatar } from '../components/ui';
import PortfolioChart from '../components/PortfolioChart';
import { computePortfolioStats, formatDisplayValue } from '../lib/portfolio';

// --- Components ---
const PortfolioCard = ({ title, value, detail, icon: Icon, gradient }) => (
    <Card className={`shadow-sm border-0 ${gradient}`}>
        <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center">
                <Icon className="w-4 h-4 mr-2" />
                {title}
            </CardTitle>
        </CardHeader>
        <CardContent>
            <div className="text-3xl font-bold">{value}</div>
            <p className="text-sm mt-1">{detail}</p>
        </CardContent>
    </Card>
);

const InventoryItemCard = ({ item }) => {
    let statusPill;
    switch (item.status) {
        case 'processing_valuation':
        case 're_valuation_started':
            statusPill = <Badge variant="secondary" className="absolute top-3 right-3">Valuating...</Badge>;
            break;
        case 'analyzed':
            statusPill = <Badge variant="default" className="absolute top-3 right-3">{item.category}</Badge>;
            break;
        case 'error':
            statusPill = <Badge variant="destructive" className="absolute top-3 right-3">Error</Badge>;
            break;
        default:
            statusPill = null;
    }
    const displayValue = formatDisplayValue(item);
    return (
        <Link to={`/item/${item.id}`}>
            <Card className="shadow-sm border-0 hover:shadow-md transition-shadow overflow-hidden">
                <div className="aspect-square relative">
                    <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover"/>
                    {statusPill}
                </div>
                <CardContent className="p-4">
                    <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2">{item.name}</h3>
                    <div className="flex items-center justify-between">
                        <span className="text-2xl font-bold text-blue-600">{displayValue}</span>
                        {item.is_trackable && (
                            <Badge variant="outline" className="text-xs text-green-600 border-green-200">
                                Tracked
                            </Badge>
                        )}
                    </div>
                </CardContent>
            </Card>
        </Link>
    );
};

export default function Dashboard() {
    const [user] = useState(auth.currentUser);
    const [inventory, setInventory] = useState([]);
    const [dragActive, setDragActive] = useState(false);
    
    // State for the form
    const [stage, setStage] = useState('upload');
    const [itemName, setItemName] = useState('');
    const [itemDesc, setItemDesc] = useState('');
    const [itemCategory, setItemCategory] = useState('');
    const [itemImageFile, setItemImageFile] = useState(null);
    const [itemImagePreview, setItemImagePreview] = useState('');
    const [formError, setFormError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [attributes, setAttributes] = useState([]);
    const [attributeValues, setAttributeValues] = useState({});

    // Fetch inventory data
    useEffect(() => {
        if (user) {
            const q = query(collection(db, "items"), where("owner", "==", user.uid), orderBy("createdAt", "desc"));
            const unsub = onSnapshot(q, (snap) => setInventory(snap.docs.map(d => ({ ...d.data(), id: d.id }))));
            return () => unsub();
        }
    }, [user]);

    // Portfolio stats calculation
    const portfolioStats = useMemo(() => computePortfolioStats(inventory), [inventory]);

    const handleDrag = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
    };

    // --- SIMPLIFIED: Stage 1 - Smart Extraction ---
    const handleImageUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
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
                const response = await fetch(`${API_URL}/api/extract-details`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ imageBase64: base64, mimeType: file.type })
                });
                if (!response.ok) throw new Error('Analysis failed.');
                
                const data = await response.json();
                
                setItemName(data.name);
                setItemDesc(data.description);
                setItemCategory(data.category);
                setAttributes(data.attributes);

                const initialValues = {};
                data.attributes.forEach(attr => {
                    initialValues[attr.name] = attr.value || '';
                });
                setAttributeValues(initialValues);

                setStage('confirm');
            } catch (err) {
                console.error('Error analyzing image:', err);
                setFormError("Could not analyze image. Please enter details manually.");
                setAttributes([
                    { name: "condition", label: "Condition", type: "select", options: ["New", "Like New", "Good", "Fair", "Poor"] }
                ]);
                setAttributeValues({ condition: 'Good' });
                setStage('confirm');
            }
        };
    };
    
    const handleAttributeChange = (name, value) => { 
        setAttributeValues(prev => ({ ...prev, [name]: value })); 
    };

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
                        const docRef = await addDoc(collection(db, "items"), {
                            name: itemName,
                            description: itemDesc,
                            category: itemCategory,
                            imageUrl: downloadURL,
                            owner: user.uid,
                            createdAt: serverTimestamp(),
                            status: 'processing_valuation',
                            attributes: attributeValues,
                        });
                        
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
                                category: itemCategory,
                                attributes: attributeValues
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
    
    const resetForm = () => {
        setStage('upload');
        setItemName('');
        setItemDesc('');
        setItemCategory('');
        setItemImageFile(null);
        setItemImagePreview('');
        setFormError('');
        setIsSubmitting(false);
        setAttributes([]);
        setAttributeValues({});
        const fileInput = document.getElementById('itemImageInput');
        if (fileInput) {
            fileInput.value = null;
        }
    };
    
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
            {/* Header */}
            <header className="bg-white border-b border-slate-200 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center h-16">
                        <div className="flex items-center space-x-4">
                            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                                Omni
                            </h1>
                        </div>
                        <div className="flex items-center space-x-4">
                            <div className="flex items-center space-x-3">
                                <Avatar fallback={user.email.charAt(0).toUpperCase()} />
                                <span className="text-sm text-slate-600 hidden sm:block">Welcome, {user.email}</span>
                            </div>
                            <Button variant="destructive" size="sm" onClick={() => auth.signOut()}>
                                <LogOut className="w-4 h-4 mr-2" />
                                Logout
                            </Button>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Portfolio Overview */}
                <div className="mb-8">
                    <h2 className="text-3xl font-bold text-slate-900 mb-6">Your Portfolio</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <PortfolioCard 
                            title="Total Estimated Value" 
                            value={`$${portfolioStats.totalValue}`}
                            detail={`${portfolioStats.trackedItems} tracked items`}
                            icon={TrendingUp}
                            gradient="bg-gradient-to-br from-blue-50 to-blue-100"
                        />
                        <PortfolioCard 
                            title="Total Items" 
                            value={inventory.length}
                            detail={`${inventory.filter(item => !item.is_trackable).length} untracked`}
                            icon={Package}
                            gradient="bg-gradient-to-br from-green-50 to-green-100"
                        />
                        <PortfolioCard 
                            title="Most Valuable Item" 
                            value={portfolioStats.mostValuable}
                            detail="Based on tracked items"
                            icon={Star}
                            gradient="bg-gradient-to-br from-purple-50 to-purple-100"
                        />
                    </div>
                </div>

                {/* Add New Item */}
                <Card className="mb-8 shadow-sm border-0">
                    <CardHeader>
                        <CardTitle className="text-xl font-semibold text-slate-900">Add New Item</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {stage === 'upload' && (
                            <div
                                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                                    dragActive ? "border-blue-400 bg-blue-50" : "border-slate-300 hover:border-slate-400"
                                }`}
                                onDragEnter={handleDrag}
                                onDragLeave={handleDrag}
                                onDragOver={handleDrag}
                                onDrop={handleDrop}
                            >
                                <input
                                    type="file"
                                    id="itemImageInput"
                                    accept="image/*"
                                    onChange={handleImageUpload}
                                    className="hidden"
                                />
                                <label htmlFor="itemImageInput" className="cursor-pointer">
                                    <Upload className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                                    <p className="text-slate-600 font-medium mb-2">Click to upload an image</p>
                                    <p className="text-sm text-slate-500">or drag and drop your item photo here</p>
                                </label>
                            </div>
                        )}

                        {stage === 'identifying' && (
                            <div className="text-center py-8">
                                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
                                <p className="text-slate-600">Performing smart analysis...</p>
                            </div>
                        )}

                        {stage === 'confirm' && (
                            <form onSubmit={handleFinalSubmit} className="space-y-4">
                                <div className="relative w-full h-48 bg-slate-50 rounded-lg overflow-hidden">
                                    <img 
                                        src={itemImagePreview} 
                                        alt="Preview" 
                                        className="w-full h-full object-contain"
                                    />
                                </div>
                                <div className="mb-4">
                                    <label className="block text-gray-700 text-sm font-bold mb-2">Item Name</label>
                                    <input 
                                        type="text" 
                                        value={itemName} 
                                        onChange={(e) => setItemName(e.target.value)} 
                                        className="shadow-sm border rounded w-full py-2 px-3" 
                                        required
                                    />
                                </div>
                                <div className="mb-4">
                                    <label className="block text-gray-700 text-sm font-bold mb-2">Category</label>
                                    <input 
                                        type="text" 
                                        value={itemCategory} 
                                        onChange={(e) => setItemCategory(e.target.value)} 
                                        className="shadow-sm border rounded w-full py-2 px-3" 
                                    />
                                </div>
                                <div className="mb-4">
                                    <label className="block text-gray-700 text-sm font-bold mb-2">Description</label>
                                    <textarea 
                                        value={itemDesc} 
                                        onChange={(e) => setItemDesc(e.target.value)} 
                                        className="shadow-sm border rounded w-full py-2 px-3" 
                                        rows="3"
                                    />
                                </div>
                                
                                {attributes.map(attr => (
                                    <div key={attr.name} className="mb-4">
                                        <label className="block text-gray-700 text-sm font-bold mb-2">{attr.label}</label>
                                        {attr.type === 'select' ? (
                                            <select 
                                                value={attributeValues[attr.name] || ''} 
                                                onChange={(e) => handleAttributeChange(attr.name, e.target.value)}
                                                className="shadow-sm border rounded w-full py-2 px-3"
                                            >
                                                {attr.options.map(opt => (
                                                    <option key={opt} value={opt}>{opt}</option>
                                                ))}
                                            </select>
                                        ) : (
                                            <input 
                                                type="text" 
                                                value={attributeValues[attr.name] || ''} 
                                                onChange={(e) => handleAttributeChange(attr.name, e.target.value)}
                                                className="shadow-sm border rounded w-full py-2 px-3"
                                            />
                                        )}
                                    </div>
                                ))}

                                <div className="flex justify-end space-x-3">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={resetForm}
                                        disabled={isSubmitting}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        type="submit"
                                        disabled={isSubmitting}
                                    >
                                        {isSubmitting ? 'Saving...' : 'Save Item'}
                                    </Button>
                                </div>
                            </form>
                        )}

                        {formError && (
                            <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-lg">
                                {formError}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Inventory */}
                <div>
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-2xl font-bold text-slate-900">Your Inventory ({inventory.length})</h2>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {inventory.map((item) => (
                            <InventoryItemCard key={item.id} item={item} />
                        ))}
                    </div>
                </div>
            </main>
        </div>
    );
} 