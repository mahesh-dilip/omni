import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { doc, collection, onSnapshot, query, orderBy, updateDoc } from "firebase/firestore";
import { db, auth, API_URL } from '../firebase';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ArrowLeft, Edit2, Save, X, RefreshCw, Trash2 } from 'lucide-react';
import { Card, CardHeader, CardContent, CardTitle } from '../components/ui';
import { Badge } from '../components/ui';
import { Button } from '../components/ui';
import { mapValuationRecord, formatDisplayValue } from '../lib/portfolio';

// A helper component for displaying attribute rows
const AttributeRow = ({ label, value }) => (
    <div className="flex justify-between py-2 border-b border-slate-200 last:border-0">
        <dt className="text-sm font-medium text-slate-600 capitalize">{label.replace(/_/g, ' ')}</dt>
        <dd className="text-sm text-slate-900 font-medium">{String(value)}</dd>
    </div>
);

export default function ItemDetailPage() {
    const { itemId } = useParams();
    const navigate = useNavigate();
    const [item, setItem] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isRevaluating, setIsRevaluating] = useState(false);
    const [valuationHistory, setValuationHistory] = useState([]);

    // State for Edit Mode
    const [isEditing, setIsEditing] = useState(false);
    const [editedName, setEditedName] = useState('');
    const [editedDesc, setEditedDesc] = useState('');
    const [editedCategory, setEditedCategory] = useState('');
    const [editedAttributes, setEditedAttributes] = useState({});
    const [isSaving, setIsSaving] = useState(false);

    // Fetch main item data
    useEffect(() => {
        if (!itemId) return;

        const docRef = doc(db, "items", itemId);
        const unsubscribe = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                const itemData = { id: docSnap.id, ...docSnap.data() };
                setItem(itemData);
                // Pre-fill edit form state when item data loads
                setEditedName(itemData.name);
                setEditedDesc(itemData.description || '');
                setEditedCategory(itemData.category);
                setEditedAttributes(itemData.attributes || {});
            } else {
                setError("Item not found.");
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, [itemId]);

    // Fetch valuation history
    useEffect(() => {
        if (!itemId) return;
        const historyQuery = query(
            collection(db, "items", itemId, "valuations"),
            orderBy("date", "asc")
        );
        const unsubscribe = onSnapshot(historyQuery, (snapshot) => {
            const historyData = snapshot.docs.map(doc => mapValuationRecord(doc.data()));
            setValuationHistory(historyData);
        });
        return () => unsubscribe();
    }, [itemId]);

    // Handler for dynamic attribute inputs in edit mode
    const handleAttributeChange = (name, value) => {
        setEditedAttributes(prev => ({ ...prev, [name]: value }));
    };

    const handleSave = async () => {
        if (!editedName.trim() || !editedCategory) {
            setError("Name and category are required.");
            return;
        }

        setIsSaving(true);
        setError(null);

        try {
            const user = auth.currentUser;
            if (!user) {
                throw new Error("You must be logged in to edit items.");
            }
            
            const token = await user.getIdToken();
            const response = await fetch(`${API_URL}/api/items/${itemId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    name: editedName.trim(),
                    description: editedDesc.trim(),
                    category: editedCategory,
                    attributes: editedAttributes
                })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Failed to save changes.');
            }

            setIsEditing(false);
        } catch (err) {
            console.error("Save error:", err);
            setError(err.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!window.confirm("Are you sure you want to permanently delete this item? This action cannot be undone.")) {
            return;
        }

        setIsDeleting(true);
        try {
            const user = auth.currentUser;
            if (!user) {
                throw new Error("You must be logged in to delete items.");
            }
            
            const token = await user.getIdToken();
            const response = await fetch(`${API_URL}/api/items/${itemId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Failed to delete item.');
            }

            navigate('/');
        } catch (err) {
            console.error("Deletion error:", err);
            setError(err.message);
            setIsDeleting(false);
        }
    };

    const handleRevaluate = async () => {
        if (item?.status && item.status.includes('valuating')) {
            return; // Prevent multiple clicks while processing
        }

        setIsRevaluating(true);
        try {
            const user = auth.currentUser;
            if (!user) throw new Error("Authentication error.");
            const token = await user.getIdToken();
            const response = await fetch(`${API_URL}/api/items/${itemId}/re-evaluate`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('Failed to re-evaluate item.');
        } catch (err) {
            console.error("Error requesting re-evaluation:", err);
            setError(err.message);
        } finally {
            setIsRevaluating(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
                <header className="bg-white shadow-sm">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                        <Link to="/" className="text-blue-600 hover:text-blue-700 flex items-center">
                            <ArrowLeft className="w-4 h-4 mr-2" />
                            Back to Inventory
                        </Link>
                    </div>
                </header>
                <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    <Card className="border-red-200 bg-red-50">
                        <CardContent className="p-6 text-center">
                            <h2 className="text-2xl font-bold text-red-600 mb-2">Error</h2>
                            <p className="text-red-700 mb-4">{error}</p>
                            <Link to="/">
                                <Button variant="outline">Return to Dashboard</Button>
                            </Link>
                        </CardContent>
                    </Card>
                </main>
            </div>
        );
    }

    if (!item) return null;

    const renderAttributeInputs = () => (
        Object.entries(editedAttributes).map(([name, value]) => {
            const label = name.replace(/_/g, ' ');
            // Special handling for the 'condition' dropdown
            if (name === 'condition') {
                return (
                    <div key={name} className="mb-4">
                        <label className="block text-slate-700 text-sm font-bold mb-1 capitalize">{label}</label>
                        <select 
                            value={value} 
                            onChange={(e) => handleAttributeChange(name, e.target.value)} 
                            className="w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        >
                            {["New", "Like New", "Good", "Fair", "Poor"].map(opt => 
                                <option key={opt} value={opt}>{opt}</option>
                            )}
                        </select>
                    </div>
                )
            }
            return (
                <div key={name} className="mb-4">
                    <label className="block text-slate-700 text-sm font-bold mb-1 capitalize">{label}</label>
                    <input 
                        type="text" 
                        value={value} 
                        onChange={(e) => handleAttributeChange(name, e.target.value)} 
                        className="w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    />
                </div>
            )
        })
    );

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
            <header className="bg-white shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex justify-between items-center">
                        <Link to="/" className="text-blue-600 hover:text-blue-700 flex items-center">
                            <ArrowLeft className="w-4 h-4 mr-2" />
                            Back to Inventory
                        </Link>
                        {isEditing ? (
                            <div className="flex space-x-2">
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        setIsEditing(false);
                                        setEditedName(item.name);
                                        setEditedDesc(item.description || '');
                                        setEditedCategory(item.category);
                                        setEditedAttributes(item.attributes || {});
                                    }}
                                    disabled={isSaving}
                                >
                                    <X className="w-4 h-4 mr-2" />
                                    Cancel
                                </Button>
                                <Button
                                    onClick={handleSave}
                                    disabled={isSaving}
                                >
                                    <Save className="w-4 h-4 mr-2" />
                                    {isSaving ? 'Saving...' : 'Save Changes'}
                                </Button>
                            </div>
                        ) : (
                            <div className="flex space-x-2">
                                <Button
                                    variant="outline"
                                    onClick={() => setIsEditing(true)}
                                >
                                    <Edit2 className="w-4 h-4 mr-2" />
                                    Edit Item
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={handleRevaluate}
                                    disabled={isRevaluating || (item?.status && item.status.includes('valuating'))}
                                >
                                    <RefreshCw className="w-4 h-4 mr-2" />
                                    {isRevaluating ? 'Re-evaluating...' : 'Re-evaluate'}
                                </Button>
                                <Button
                                    variant="destructive"
                                    onClick={handleDelete}
                                    disabled={isDeleting}
                                >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    {isDeleting ? 'Deleting...' : 'Delete Item'}
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Left Column - Image and Basic Info */}
                    <div className="space-y-6">
                        <Card className="overflow-hidden">
                            <div className="relative aspect-square">
                                <img 
                                    src={item.imageUrl} 
                                    alt={item.name} 
                                    className="w-full h-full object-contain bg-slate-50"
                                />
                            </div>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Valuation Details</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center">
                                        <span className="text-slate-600">Current Value</span>
                                        <span className="text-2xl font-bold text-blue-600">
                                            {formatDisplayValue(item)}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-slate-600">Status</span>
                                        <Badge variant={item.status === 'analyzed' ? 'default' : 'secondary'}>
                                            {item.status === 'analyzed' ? 'Analyzed' : 'Processing'}
                                        </Badge>
                                    </div>
                                    {item.is_trackable && (
                                        <div className="flex justify-between items-center">
                                            <span className="text-slate-600">Tracking</span>
                                            <Badge variant="outline" className="text-green-600 border-green-200">
                                                Active
                                            </Badge>
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Right Column - Details and History */}
                    <div className="space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>Item Details</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {isEditing ? (
                                    <form className="space-y-4">
                                        <div>
                                            <label className="block text-slate-700 text-sm font-bold mb-1">Name</label>
                                            <input
                                                type="text"
                                                value={editedName}
                                                onChange={(e) => setEditedName(e.target.value)}
                                                className="w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-slate-700 text-sm font-bold mb-1">Category</label>
                                            <input
                                                type="text"
                                                value={editedCategory}
                                                onChange={(e) => setEditedCategory(e.target.value)}
                                                className="w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-slate-700 text-sm font-bold mb-1">Description</label>
                                            <textarea
                                                value={editedDesc}
                                                onChange={(e) => setEditedDesc(e.target.value)}
                                                rows="3"
                                                className="w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                            />
                                        </div>
                                        {renderAttributeInputs()}
                                    </form>
                                ) : (
                                    <dl className="divide-y divide-slate-200">
                                        <div className="py-3">
                                            <dt className="text-sm font-medium text-slate-600">Name</dt>
                                            <dd className="mt-1 text-sm text-slate-900">{item.name}</dd>
                                        </div>
                                        <div className="py-3">
                                            <dt className="text-sm font-medium text-slate-600">Category</dt>
                                            <dd className="mt-1 text-sm text-slate-900">{item.category}</dd>
                                        </div>
                                        {item.description && (
                                            <div className="py-3">
                                                <dt className="text-sm font-medium text-slate-600">Description</dt>
                                                <dd className="mt-1 text-sm text-slate-900">{item.description}</dd>
                                            </div>
                                        )}
                                    </dl>
                                )}
                            </CardContent>
                        </Card>

                        {item.attributes && Object.keys(item.attributes).length > 0 && (
                            <Card>
                                <CardHeader>
                                    <CardTitle>Specifications</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <dl className="divide-y divide-slate-200">
                                        {Object.entries(item.attributes).map(([key, value]) => (
                                            <AttributeRow key={key} label={key} value={value} />
                                        ))}
                                    </dl>
                                </CardContent>
                            </Card>
                        )}

                        {valuationHistory.length > 0 && (
                            <Card>
                                <CardHeader>
                                    <CardTitle>Valuation History</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="h-64">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <LineChart data={valuationHistory}>
                                                <CartesianGrid strokeDasharray="3 3" />
                                                <XAxis dataKey="date" />
                                                <YAxis />
                                                <Tooltip />
                                                <Legend />
                                                <Line 
                                                    type="monotone" 
                                                    dataKey="value" 
                                                    stroke="#2563eb" 
                                                    name="Value"
                                                />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
} 