import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  where, 
  onSnapshot, 
  serverTimestamp 
} from 'firebase/firestore';
import { db, handleFirestoreError } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { Recipe, RecipeIngredient, OperationType } from '../../types';
import { cn } from '../../lib/utils';
import { 
  Sparkles, 
  Plus, 
  Trash2, 
  Scale, 
  RefreshCcw, 
  Bookmark, 
  BookOpen, 
  Search, 
  ChevronDown, 
  ChevronUp, 
  Calculator, 
  X, 
  Check, 
  FileText, 
  Printer, 
  AlertCircle,
  HelpCircle,
  ArrowRight,
  Camera
} from 'lucide-react';
import { createLog } from '../../services/logService';

const CATEGORIES = ['Cake', 'Cookie', 'Pastry', 'Chocolate', 'Bread', 'Other'];

const SAMPLE_PROMPTS = [
  { label: 'Eggless Butter Cake', text: 'Classic eggless vanilla butter sponge cake' },
  { label: 'Dark Chocolate Ganache', text: 'Silky dark chocolate ganache with 60% couverture' },
  { label: 'High-Yield Sourdough', text: 'Sourdough bread recipe optimized for bakeries (yields 10 loaves)' },
  { label: 'Belgian Choco Dragees', text: 'Crispy biscuit-center dragees with Belgian chocolate coating' }
];

export const RecipeManager: React.FC = () => {
  const { bakery, profile } = useAuth();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  
  // UI states
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  
  // Form stats
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCategory, setFormCategory] = useState('Cake');
  const [formPrepTime, setFormPrepTime] = useState('20 mins');
  const [formBakingTime, setFormBakingTime] = useState('30 mins');
  const [formYield, setFormYield] = useState('1 Cake (8 inch)');
  const [formIngredients, setFormIngredients] = useState<RecipeIngredient[]>([{ name: '', amount: 0, unit: 'g' }]);
  const [formInstructions, setFormInstructions] = useState<string[]>(['']);
  const [formAllergenInfo, setFormAllergenInfo] = useState('');
  const [formAiTips, setFormAiTips] = useState('');

  // Nutrition facts form states
  const [formNutritionCalories, setFormNutritionCalories] = useState<number | ''>('');
  const [formNutritionProtein, setFormNutritionProtein] = useState<number | ''>('');
  const [formNutritionCarbs, setFormNutritionCarbs] = useState<number | ''>('');
  const [formNutritionFat, setFormNutritionFat] = useState<number | ''>('');
  const [formNutritionFiber, setFormNutritionFiber] = useState<number | ''>('');
  const [formNutritionSugar, setFormNutritionSugar] = useState<number | ''>('');
  const [formNutritionServingSize, setFormNutritionServingSize] = useState<string>('');

  // OCR/Photograph State
  const [draftMode, setDraftMode] = useState<'text' | 'photo'>('text');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoAnalyzing, setPhotoAnalyzing] = useState(false);

  // AI assistant states
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiNotes, setAiNotes] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Scaler calculator states
  const [scaleFactor, setScaleFactor] = useState(1);
  const [scalePreset, setScalePreset] = useState('1'); // custom multiplier or preset (e.g. 2x, 5x)
  const [scalingTips, setScalingTips] = useState('');
  const [scalingAiRunning, setScalingAiRunning] = useState(false);

  // Substitution state
  const [substituteType, setSubstituteType] = useState('eggless');
  const [substitutingRunning, setSubstitutingRunning] = useState(false);

  // Load recipes (Strictly isolated by bakeryId)
  useEffect(() => {
    if (!bakery?.id) return;
    
    setLoading(true);
    const q = query(
      collection(db, 'recipes'), 
      where('bakeryId', '==', bakery.id)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const items: Recipe[] = [];
      snapshot.forEach((doc) => {
        items.push({ id: doc.id, ...doc.data() } as Recipe);
      });
      setRecipes(items);
      setLoading(false);
    }, (err) => {
      console.error(err);
      handleFirestoreError(err, OperationType.LIST, 'recipes');
      setLoading(false);
    });

    return () => unsub();
  }, [bakery?.id]);

  // Handle manual form ingredients
  const addIngredientField = () => {
    setFormIngredients([...formIngredients, { name: '', amount: 0, unit: 'g' }]);
  };

  const removeIngredientField = (index: number) => {
    setFormIngredients(formIngredients.filter((_, i) => i !== index));
  };

  const updateIngredientField = (index: number, field: keyof RecipeIngredient, value: string | number) => {
    const updated = [...formIngredients];
    if (field === 'amount') {
      updated[index].amount = Number(value) || 0;
    } else {
      updated[index][field] = value as string;
    }
    setFormIngredients(updated);
  };

  // Handle manual instructions
  const addInstructionStep = () => {
    setFormInstructions([...formInstructions, '']);
  };

  const removeInstructionStep = (index: number) => {
    setFormInstructions(formInstructions.filter((_, i) => i !== index));
  };

  const updateInstructionStep = (index: number, value: string) => {
    const updated = [...formInstructions];
    updated[index] = value;
    setFormInstructions(updated);
  };

  // Prepare recipe save
  const handleSaveRecipe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bakery?.id) return;
    if (!formName.trim()) {
      alert("Please provide a name for the recipe.");
      return;
    }

    const filteredIngredients = formIngredients.filter(i => i.name.trim() !== '');
    const filteredInstructions = formInstructions.filter(step => step.trim() !== '');

    if (filteredIngredients.length === 0) {
      alert("At least one ingredient is required.");
      return;
    }
    if (filteredInstructions.length === 0) {
      alert("At least one instruction step is required.");
      return;
    }

    const payload: Omit<Recipe, 'id'> & { updatedAt?: any } = {
      bakeryId: bakery.id,
      name: formName.trim(),
      description: formDescription.trim(),
      category: formCategory,
      prepTime: formPrepTime.trim(),
      bakingTime: formBakingTime.trim(),
      yield: formYield.trim(),
      ingredients: filteredIngredients,
      instructions: filteredInstructions,
      allergenInfo: formAllergenInfo.trim(),
      aiTips: formAiTips.trim(),
      nutrition: formNutritionCalories !== '' || formNutritionProtein !== '' || formNutritionCarbs !== '' || formNutritionFat !== '' || formNutritionFiber !== '' || formNutritionSugar !== '' || formNutritionServingSize !== '' ? {
        calories: formNutritionCalories !== '' ? Number(formNutritionCalories) : undefined,
        protein: formNutritionProtein !== '' ? Number(formNutritionProtein) : undefined,
        carbs: formNutritionCarbs !== '' ? Number(formNutritionCarbs) : undefined,
        fat: formNutritionFat !== '' ? Number(formNutritionFat) : undefined,
        fiber: formNutritionFiber !== '' ? Number(formNutritionFiber) : undefined,
        sugar: formNutritionSugar !== '' ? Number(formNutritionSugar) : undefined,
        servingSize: formNutritionServingSize.trim() || undefined
      } : undefined,
      createdAt: selectedRecipe && isEditing ? (selectedRecipe.createdAt || new Date()) : new Date(),
      createdBy: profile?.displayName || profile?.email || 'admin'
    };

    try {
      if (selectedRecipe && isEditing) {
        // Update
        const docRef = doc(db, 'recipes', selectedRecipe.id);
        payload.updatedAt = serverTimestamp();
        await updateDoc(docRef, payload);
        await createLog('bakery', `UPDATED RECIPE: ${payload.name}`, profile?.uid, profile?.email, bakery.id);
        alert("Recipe updated successfully.");
      } else {
        // Create
        const docRef = await addDoc(collection(db, 'recipes'), {
          ...payload,
          createdAt: serverTimestamp()
        });
        await createLog('bakery', `SAVED NEW RECIPE: ${payload.name}`, profile?.uid, profile?.email, bakery.id);
        alert("Recipe created and saved.");
      }

      // Reset
      setIsEditing(false);
      setIsCreatingNew(false);
      resetForm();
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, selectedRecipe ? OperationType.UPDATE : OperationType.CREATE, 'recipes');
    }
  };

  const resetForm = () => {
    setFormName('');
    setFormDescription('');
    setFormCategory('Cake');
    setFormPrepTime('20 mins');
    setFormBakingTime('30 mins');
    setFormYield('1 Cake (8 inch)');
    setFormIngredients([{ name: '', amount: 0, unit: 'g' }]);
    setFormInstructions(['']);
    setFormAllergenInfo('');
    setFormAiTips('');
    setAiPrompt('');
    setAiNotes('');
    setAiError(null);
    setFormNutritionCalories('');
    setFormNutritionProtein('');
    setFormNutritionCarbs('');
    setFormNutritionFat('');
    setFormNutritionFiber('');
    setFormNutritionSugar('');
    setFormNutritionServingSize('');
    setPhotoFile(null);
    setPhotoPreview(null);
    setPhotoAnalyzing(false);
  };

  // Open recipe to edit
  const startEdit = (recipe: Recipe) => {
    setSelectedRecipe(recipe);
    setFormName(recipe.name);
    setFormDescription(recipe.description || '');
    setFormCategory(recipe.category || 'Cake');
    setFormPrepTime(recipe.prepTime || '20 mins');
    setFormBakingTime(recipe.bakingTime || '30 mins');
    setFormYield(recipe.yield || '1 Yield');
    setFormIngredients(recipe.ingredients.length > 0 ? [...recipe.ingredients] : [{ name: '', amount: 0, unit: 'g' }]);
    setFormInstructions(recipe.instructions.length > 0 ? [...recipe.instructions] : ['']);
    setFormAllergenInfo(recipe.allergenInfo || '');
    setFormAiTips(recipe.aiTips || '');
    
    if (recipe.nutrition) {
      setFormNutritionCalories(recipe.nutrition.calories ?? '');
      setFormNutritionProtein(recipe.nutrition.protein ?? '');
      setFormNutritionCarbs(recipe.nutrition.carbs ?? '');
      setFormNutritionFat(recipe.nutrition.fat ?? '');
      setFormNutritionFiber(recipe.nutrition.fiber ?? '');
      setFormNutritionSugar(recipe.nutrition.sugar ?? '');
      setFormNutritionServingSize(recipe.nutrition.servingSize ?? '');
    } else {
      setFormNutritionCalories('');
      setFormNutritionProtein('');
      setFormNutritionCarbs('');
      setFormNutritionFat('');
      setFormNutritionFiber('');
      setFormNutritionSugar('');
      setFormNutritionServingSize('');
    }

    setIsEditing(true);
    setIsCreatingNew(false);
  };

  // Delete Recipe
  const handleDeleteRecipe = async (recipeId: string, name: string) => {
    if (!window.confirm(`Are you sure you want to permanently delete the recipe: "${name}"? This cannot be undone.`)) return;
    try {
      await deleteDoc(doc(db, 'recipes', recipeId));
      await createLog('bakery', `DELETED RECIPE: ${name}`, profile?.uid, profile?.email, bakery?.id || '');
      if (selectedRecipe?.id === recipeId) {
        setSelectedRecipe(null);
      }
      alert(`Deleted recipe: "${name}"`);
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.DELETE, `recipes/${recipeId}`);
    }
  };

  // AI Recipes Generation helper using the Proxy API
  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) {
      alert("Please specify what recipe template you want to generate.");
      return;
    }
    setAiGenerating(true);
    setAiError(null);

    try {
      const response = await fetch("/api/recipes/ai-helper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          prompt: aiPrompt,
          notes: aiNotes,
          recipeData: { category: formCategory }
        })
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const generatedRecipe = await response.json();

      // Populate form with generated recipe details!
      setFormName(generatedRecipe.recipeName || aiPrompt);
      setFormDescription(generatedRecipe.description || '');
      setFormPrepTime(generatedRecipe.prepTime || '20 mins');
      setFormBakingTime(generatedRecipe.bakingTime || '30 mins');
      setFormYield(generatedRecipe.yield || '1 Yield');
      setFormIngredients(generatedRecipe.ingredients || [{ name: '', amount: 0, unit: 'g' }]);
      setFormInstructions(generatedRecipe.instructions || ['']);
      setFormAllergenInfo(generatedRecipe.allergenInfo || 'None');
      setFormAiTips(generatedRecipe.aiTips || '');

      setAiPrompt('');
      setAiNotes('');
      alert("AI recipe generated! Review ingredients, steps, and tips below, and click save!");
    } catch (err: any) {
      console.error(err);
      setAiError(err.message || "Could not generate recipe. Please check your network and model connection.");
    } finally {
      setAiGenerating(false);
    }
  };

  // AI Live Scaling using Gemini on the backup proxy
  const handleAiScaleScale = async () => {
    if (!selectedRecipe) return;
    setScalingAiRunning(true);

    try {
      const response = await fetch("/api/recipes/ai-helper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "scale",
          scaleFactor: scaleFactor,
          notes: `Scaling for: ${scaleFactor}x target batch size. Preset info: ${scalePreset}`,
          recipeData: { ingredients: selectedRecipe.ingredients }
        })
      });

      if (!response.ok) throw new Error("Scaling service failed.");
      const scaledData = await response.json();

      // Temporarily override local selected recipe ingredients with scaled values for the UI
      setSelectedRecipe({
        ...selectedRecipe,
        ingredients: scaledData.ingredients,
        aiTips: `${selectedRecipe.aiTips || ''}\n\n[Scaling Guidelines]: ${scaledData.scalingTips}`
      });
      setScalingTips(scaledData.scalingTips || "Success.");
      alert(`AI accurately adjusted ingredients for ${scaleFactor}x yield!`);
    } catch (e) {
      console.error(e);
      alert("Could not process AI scaling. Using manual clientside scaling instead.");
    } finally {
      setScalingAiRunning(false);
    }
  };

  // AI Substitution helper using the server-side API proxy
  const handleAiSubstitution = async () => {
    if (!selectedRecipe) return;
    setSubstitutingRunning(true);

    try {
      const response = await fetch("/api/recipes/ai-helper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "substitute",
          notes: substituteType,
          recipeData: { 
            ingredients: selectedRecipe.ingredients,
            instructions: selectedRecipe.instructions
          }
        })
      });

      if (!response.ok) throw new Error("Substitution conversion failed.");
      const converted = await response.json();

      // Open in Create mode to let them review and save it as a new variant!
      setFormName(`${selectedRecipe.name} (${substituteType.toUpperCase()} Variant)`);
      setFormDescription(converted.description || `Alternative safe variant of ${selectedRecipe.name}`);
      setFormCategory(selectedRecipe.category || 'Cake');
      setFormPrepTime(selectedRecipe.prepTime || '30 mins');
      setFormBakingTime(selectedRecipe.bakingTime || '35 mins');
      setFormYield(selectedRecipe.yield || '1 Variant');
      setFormIngredients(converted.ingredients);
      setFormInstructions(converted.instructions);
      setFormAllergenInfo(`${substituteType.toUpperCase()} friendly adjustments. Prev: ${selectedRecipe.allergenInfo || 'None'}`);
      setFormAiTips(converted.aiTips);

      setIsCreatingNew(true);
      setIsEditing(false);
      setSelectedRecipe(null);
      alert(`Successfully generated a ${substituteType} recipe variant! You can now adjust or click SAVE below.`);
    } catch (e) {
      console.error(e);
      alert("Failed to query alternative baking assistant. Keep trying in a few moments!");
    } finally {
      setSubstitutingRunning(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Convert File object to Base64 data URL string
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  // Upload and analyze recipe image (Camera / Gallery)
  const handlePhotoUploadAndAnalyze = async () => {
    if (!photoFile) {
      alert("Please select or capture a recipe image first.");
      return;
    }
    setPhotoAnalyzing(true);
    setAiError(null);
    try {
      const base64Str = await fileToBase64(photoFile);
      const res = await fetch("/api/recipes/analyze-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: base64Str,
          mimeType: photoFile.type
        })
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const data = await res.json();
      
      // Populate fields from analyzed recipe
      setFormName(data.recipeName || "Extracted Recipe");
      setFormDescription(data.description || "Analyzed from photograph");
      setFormPrepTime(data.prepTime || "20 mins");
      setFormBakingTime(data.bakingTime || "30 mins");
      setFormYield(data.yield || "1 Batch");
      setFormIngredients(data.ingredients || [{ name: '', amount: 0, unit: 'g' }]);
      setFormInstructions(data.instructions || ['']);
      setFormAllergenInfo(data.allergenInfo || "None detected");
      setFormAiTips(data.aiTips || "");
      
      if (data.nutrition) {
        setFormNutritionCalories(data.nutrition.calories ?? '');
        setFormNutritionProtein(data.nutrition.protein ?? '');
        setFormNutritionCarbs(data.nutrition.carbs ?? '');
        setFormNutritionFat(data.nutrition.fat ?? '');
        setFormNutritionFiber(data.nutrition.fiber ?? '');
        setFormNutritionSugar(data.nutrition.sugar ?? '');
        setFormNutritionServingSize(data.nutrition.servingSize ?? '');
      }

      alert("AI successfully recognized the photo, parsed ingredients/steps, and calculated nutrition facts! Please review below and save.");
    } catch (err: any) {
      console.error(err);
      setAiError(err.message || "Could not analyze the photo. Please check your image type (JPEG/PNG) and retry.");
    } finally {
      setPhotoAnalyzing(false);
    }
  };

  // Directly calculate and save nutrition info for an existing selected recipe card
  const handleDirectCalculateNutrition = async () => {
    if (!selectedRecipe) return;
    setPhotoAnalyzing(true);
    try {
      const res = await fetch("/api/recipes/calculate-nutrition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: selectedRecipe.name,
          ingredients: selectedRecipe.ingredients,
          yieldText: selectedRecipe.yield
        })
      });
      if (!res.ok) throw new Error(await res.text());
      const nutritionFacts = await res.json();
      
      // Permanently save to Firestore doc
      const docRef = doc(db, 'recipes', selectedRecipe.id);
      await updateDoc(docRef, {
        nutrition: nutritionFacts,
        updatedAt: serverTimestamp()
      });
      
      // Update local active state
      setSelectedRecipe({
        ...selectedRecipe,
        nutrition: nutritionFacts
      });
      
      // create log
      await createLog('bakery', `CALCULATED NUTRITION FACTS: ${selectedRecipe.name}`, profile?.uid, profile?.email, bakery?.id || '');
      alert("Nutrition facts calculated successfully and saved permanently to this recipe!");
    } catch (err: any) {
      console.error(err);
      alert("Failed to calculate nutrition values automatically: " + (err.message || err));
    } finally {
      setPhotoAnalyzing(false);
    }
  };

  const filteredRecipes = recipes.filter(r => {
    const matchesSearch = r.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (r.description && r.description.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = categoryFilter === 'All' || r.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-slate-50/50 p-6">
      
      {/* Top Banner and Brand Row */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-black tracking-widest uppercase bg-blue-100 text-blue-700 px-2 py-0.5 rounded-md">Smart Module</span>
            <span className="text-[10px] font-black tracking-widest uppercase bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-md">Secured Per-Bakery</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight uppercase flex items-center gap-2.5">
            <BookOpen className="w-6 h-6 text-blue-600" />
            Recipe Registry & Assistant
          </h1>
          <p className="text-xs text-slate-500 mt-1">Design, scale, and secure recipes. No other bakeries can view your kitchen secrets.</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          {!isEditing && !isCreatingNew ? (
            <button
              onClick={() => { resetForm(); setIsCreatingNew(true); }}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase tracking-widest px-6 py-3 rounded-2xl transition-all shadow-sm focus:ring-2 focus:ring-blue-500 active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              New Recipe
            </button>
          ) : (
            <button
              onClick={() => { setIsEditing(false); setIsCreatingNew(false); resetForm(); }}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-black uppercase tracking-widest px-6 py-3 shadow-sm rounded-2xl transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
              Cancel Draft
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* VIEW 1: Form View (Creating or Editing) */}
        {(isCreatingNew || isEditing) && (
          <div className="lg:col-span-8 bg-white border border-slate-200/80 rounded-[2rem] shadow-sm p-6 overflow-hidden">
            
            {/* AI Generator Box integrated beautifully inside recipe editor */}
            {!isEditing && (
              <div className="mb-6 p-5 bg-slate-50 rounded-[1.5rem] border border-blue-100 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-100/30 rounded-full blur-2xl -z-0 pointer-events-none" />
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-blue-600 animate-pulse" />
                  <span className="text-[10px] font-black uppercase tracking-[0.1em] text-blue-700">AI Recipe Draft Assistant</span>
                </div>
                <p className="text-[11px] text-slate-600 mb-4 flex-wrap">Write a prompt or scan a recipe photo (e.g. from your paper notes or cook books). Gemini will automatically parse the recipe and calculate detailed nutrition facts per serving!</p>
                
                {/* Assistant Mode Tabs */}
                <div className="flex gap-4 mb-4 border-b border-slate-200/60 pb-2 relative z-10">
                  <button
                    type="button"
                    onClick={() => { setDraftMode('text'); setAiError(null); }}
                    className={cn(
                      "pb-1.5 text-[10px] font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer",
                      draftMode === 'text' ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400 hover:text-slate-600"
                    )}
                  >
                    Draft with Text Prompt
                  </button>
                  <button
                    type="button"
                    onClick={() => { setDraftMode('photo'); setAiError(null); }}
                    className={cn(
                      "pb-1.5 text-[10px] font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-1",
                      draftMode === 'photo' ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400 hover:text-slate-600"
                    )}
                  >
                    <Camera className="w-3.5 h-3.5 text-blue-500" /> Click / Scan Recipe Photo
                  </button>
                </div>

                {draftMode === 'text' ? (
                  <div className="space-y-3 relative z-10">
                    <div>
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">AI Recipe Prompt</label>
                      <input 
                        type="text" 
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        placeholder="e.g. Premium Lavender Rosewater Cake, Crunchy Almond Macarons..."
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Culinary Guidelines or Cost Restrictions (Optional)</label>
                      <textarea 
                        value={aiNotes}
                        onChange={(e) => setAiNotes(e.target.value)}
                        rows={2}
                        placeholder="e.g. Ensure it is completely eggless, low fat, yields 1 large banquet platter, include dark chocolate coating rules..."
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    
                    {/* Prompt Quick Badges */}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {SAMPLE_PROMPTS.map((sample, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => { setAiPrompt(sample.text); setAiNotes('Optimize for a medium commercial kitchen.'); }}
                          className="px-2.5 py-1 bg-white border border-slate-200 hover:border-blue-500 hover:text-blue-600 text-slate-500 text-[9px] font-medium rounded-lg transition-all cursor-pointer"
                        >
                          + {sample.label}
                        </button>
                      ))}
                    </div>

                    {aiError && (
                      <div className="p-3 bg-red-50 text-red-600 text-[10px] rounded-xl flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        <span>{aiError}</span>
                      </div>
                    )}

                    <div className="flex justify-end pt-2">
                      <button
                        type="button"
                        disabled={aiGenerating}
                        onClick={handleAiGenerate}
                        className={cn(
                          "flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-white py-2.5 px-6 rounded-xl transition-all cursor-pointer",
                          aiGenerating ? "bg-slate-400 cursor-not-allowed animate-pulse" : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:shadow-md"
                        )}
                      >
                        {aiGenerating ? (
                          <>
                            <RefreshCcw className="w-3.5 h-3.5 animate-spin" />
                            Consulting Culinary AI...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3.5 h-3.5" />
                            Build Recipe Template
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 relative z-10 w-full">
                    <p className="text-[11px] text-slate-500 italic">Snap a clear picture of a handwritten recipe page or book sheet. Gemini will scan it, transcribe it to digital form, and calculate serving-size nutrition facts!</p>
                    <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 hover:border-blue-400 rounded-2xl p-6 transition-all bg-white relative group cursor-pointer">
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setPhotoFile(file);
                            setPhotoPreview(URL.createObjectURL(file));
                          }
                        }}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                      />
                      {photoPreview ? (
                        <div className="text-center relative z-20">
                          <img 
                            src={photoPreview} 
                            alt="Recipe Snapshot" 
                            className="max-h-40 mx-auto rounded-xl shadow-sm border border-slate-100 object-cover mb-2"
                          />
                          <p className="text-[10px] text-slate-500 font-bold">{photoFile?.name}</p>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setPhotoFile(null);
                              setPhotoPreview(null);
                            }}
                            className="text-[9px] font-black text-red-500 hover:underline uppercase tracking-wider mt-1.5 cursor-pointer"
                          >
                            Remove / Re-select Image
                          </button>
                        </div>
                      ) : (
                        <div className="text-center">
                          <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-2 text-blue-600 group-hover:scale-110 transition-transform">
                            <Camera className="w-5 h-5" />
                          </div>
                          <span className="text-xs font-bold text-slate-700 block">Capture Photo or Drag & Drop Image Here</span>
                          <span className="text-[9px] text-slate-400 block mt-0.5">Capture with mobile camera or upload from files</span>
                        </div>
                      )}
                    </div>

                    {aiError && (
                      <div className="p-3 bg-red-50 text-red-600 text-[10px] rounded-xl flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        <span>{aiError}</span>
                      </div>
                    )}

                    {photoFile && (
                      <div className="flex justify-end pt-2">
                        <button
                          type="button"
                          disabled={photoAnalyzing}
                          onClick={handlePhotoUploadAndAnalyze}
                          className={cn(
                            "flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-white py-2.5 px-6 rounded-xl transition-all cursor-pointer",
                            photoAnalyzing ? "bg-slate-400 cursor-not-allowed animate-pulse" : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:shadow-md"
                          )}
                        >
                          {photoAnalyzing ? (
                            <>
                              <RefreshCcw className="w-3.5 h-3.5 animate-spin" />
                              Analyzing Recipe Photo...
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-3.5 h-3.5 text-amber-200 animate-pulse" />
                              Transcribe & Calculate Nutrition
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <h2 className="text-base font-black uppercase tracking-tight text-slate-800 border-b border-slate-100 pb-3 mb-4">
              {isEditing ? `Edit Recipe: ${formName}` : 'Recipe Specifications'}
            </h2>

            {/* Manual Edit Form */}
            <form onSubmit={handleSaveRecipe} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">Recipe Name *</label>
                  <input 
                    type="text" 
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Classic Vanilla Sponge"
                    required
                    className="w-full border border-slate-200 rounded-xl px-4 py-2 text-xs focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">Category</label>
                  <select 
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500"
                  >
                    {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">Description / Brief Summary</label>
                <input 
                  type="text" 
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="An ultra-light moist sponge, perfect for tiered custom cakes."
                  className="w-full border border-slate-200 rounded-xl px-4 py-2 text-xs focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">Prep Time</label>
                  <input 
                    type="text" 
                    value={formPrepTime}
                    onChange={(e) => setFormPrepTime(e.target.value)}
                    placeholder="25 mins"
                    className="w-full border border-slate-200 rounded-xl px-4 py-2 text-xs focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">Bake Time</label>
                  <input 
                    type="text" 
                    value={formBakingTime}
                    onChange={(e) => setFormBakingTime(e.target.value)}
                    placeholder="35 mins"
                    className="w-full border border-slate-200 rounded-xl px-4 py-2 text-xs focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">Yield / Standard Output</label>
                  <input 
                    type="text" 
                    value={formYield}
                    onChange={(e) => setFormYield(e.target.value)}
                    placeholder="1 Batch (12 servings)"
                    className="w-full border border-slate-200 rounded-xl px-4 py-2 text-xs focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Ingredients List Builder */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Ingredients (Precise Weights & Ratios)</label>
                  <button
                    type="button"
                    onClick={addIngredientField}
                    className="text-[10px] font-black text-blue-600 hover:text-blue-700 uppercase tracking-widest flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Ingredient
                  </button>
                </div>
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {formIngredients.map((ing, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <input 
                        type="text" 
                        value={ing.name}
                        onChange={(e) => updateIngredientField(idx, 'name', e.target.value)}
                        placeholder="e.g. All-Purpose Flour"
                        className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500"
                      />
                      <input 
                        type="number" 
                        step="any"
                        value={ing.amount || ''}
                        onChange={(e) => updateIngredientField(idx, 'amount', e.target.value)}
                        placeholder="Amount"
                        className="w-24 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500"
                      />
                      <input 
                        type="text" 
                        value={ing.unit}
                        onChange={(e) => updateIngredientField(idx, 'unit', e.target.value)}
                        placeholder="unit (e.g. g)"
                        className="w-16 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500 text-center"
                      />
                      <button
                        type="button"
                        disabled={formIngredients.length <= 1}
                        onClick={() => removeIngredientField(idx)}
                        className="p-2 border border-red-150 hover:bg-red-50 text-red-500 rounded-xl focus:ring-2 focus:ring-red-500 cursor-pointer disabled:opacity-30"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Instructions List Builder */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Process Steps (In Sequence)</label>
                  <button
                    type="button"
                    onClick={addInstructionStep}
                    className="text-[10px] font-black text-blue-600 hover:text-blue-700 uppercase tracking-widest flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Step
                  </button>
                </div>
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {formInstructions.map((step, idx) => (
                    <div key={idx} className="flex gap-2 items-start">
                      <span className="w-6 h-6 flex items-center justify-center bg-slate-100 rounded-full font-bold text-xs text-slate-500 mt-2 flex-shrink-0">{idx+1}</span>
                      <textarea 
                        value={step}
                        onChange={(e) => updateInstructionStep(idx, e.target.value)}
                        placeholder={`Mix dry items...`}
                        rows={1}
                        className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500 min-h-[38px] resize-y"
                      />
                      <button
                        type="button"
                        disabled={formInstructions.length <= 1}
                        onClick={() => removeInstructionStep(idx)}
                        className="p-2 border border-red-150 hover:bg-red-50 text-red-500 rounded-xl focus:ring-2 focus:ring-red-500 cursor-pointer disabled:opacity-30 mt-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-100 pt-3">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">Allergen Flags / Dietary Info</label>
                  <input 
                    type="text" 
                    value={formAllergenInfo}
                    onChange={(e) => setFormAllergenInfo(e.target.value)}
                    placeholder="Contains gluten, lactose (dairy)"
                    className="w-full border border-slate-200 rounded-xl px-4 py-2 text-xs focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">Chef Tips & Secrets</label>
                  <input 
                    type="text" 
                    value={formAiTips}
                    onChange={(e) => setFormAiTips(e.target.value)}
                    placeholder="Sift flour 3 times for extra fluffy air infusion."
                    className="w-full border border-slate-200 rounded-xl px-4 py-2 text-xs focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Optional Nutrition Facts */}
              <div className="border-t border-slate-100 pt-3">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-3">Estimated Nutrition Facts (Optional, per serving)</span>
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
                  <div>
                    <label className="text-[9px] font-bold uppercase text-slate-500 block mb-1">Serving Size</label>
                    <input 
                      type="text" 
                      value={formNutritionServingSize}
                      onChange={(e) => setFormNutritionServingSize(e.target.value)}
                      placeholder="e.g. 1 Slice"
                      className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold uppercase text-slate-500 block mb-1">Calories (kcal)</label>
                    <input 
                      type="number" 
                      value={formNutritionCalories === '' ? '' : formNutritionCalories}
                      onChange={(e) => setFormNutritionCalories(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="kcal"
                      className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold uppercase text-slate-500 block mb-1">Protein (g)</label>
                    <input 
                      type="number" 
                      value={formNutritionProtein === '' ? '' : formNutritionProtein}
                      onChange={(e) => setFormNutritionProtein(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="g"
                      className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold uppercase text-slate-500 block mb-1">Carbs (g)</label>
                    <input 
                      type="number" 
                      value={formNutritionCarbs === '' ? '' : formNutritionCarbs}
                      onChange={(e) => setFormNutritionCarbs(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="g"
                      className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold uppercase text-slate-500 block mb-1">Fat (g)</label>
                    <input 
                      type="number" 
                      value={formNutritionFat === '' ? '' : formNutritionFat}
                      onChange={(e) => setFormNutritionFat(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="g"
                      className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold uppercase text-slate-500 block mb-1">Fiber (g)</label>
                    <input 
                      type="number" 
                      value={formNutritionFiber === '' ? '' : formNutritionFiber}
                      onChange={(e) => setFormNutritionFiber(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="g"
                      className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold uppercase text-slate-500 block mb-1">Sugar (g)</label>
                    <input 
                      type="number" 
                      value={formNutritionSugar === '' ? '' : formNutritionSugar}
                      onChange={(e) => setFormNutritionSugar(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="g"
                      className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              <div className="flex pt-4 gap-3 border-t border-slate-100 justify-end">
                <button
                  type="button"
                  onClick={() => { setIsEditing(false); setIsCreatingNew(false); resetForm(); }}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-black uppercase tracking-widest px-6 py-3.5 rounded-xl transition-all cursor-pointer"
                >
                  Discard
                </button>
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase tracking-widest px-8 py-3.5 rounded-xl hover:shadow-md transition-all cursor-pointer"
                >
                  {isEditing ? 'Confirm Updates' : 'Save To Registry'}
                </button>
              </div>

            </form>
          </div>
        )}

        {/* VIEW 2: Grid and Details View */}
        <div className={cn(
          "bg-white border border-slate-200/85 rounded-[2rem] shadow-sm p-6 overflow-hidden",
          (isCreatingNew || isEditing) ? "lg:col-span-4" : "lg:col-span-12"
        )}>
          
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 border-b border-slate-100 pb-4 mb-4">
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-tight">Catalog</span>
              <button
                onClick={() => setCategoryFilter('All')}
                className={cn(
                  "px-3 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all",
                  categoryFilter === 'All' ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                )}
              >
                All
              </button>
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={cn(
                    "px-3 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all",
                    categoryFilter === cat ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
            
            <div className="relative w-full md:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search recipe catalog..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-1.5 text-xs focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {loading ? (
            <div className="py-20 text-center text-slate-400 animate-pulse">
              <RefreshCcw className="w-8 h-8 animate-spin mx-auto mb-3 text-slate-200" />
              <span className="text-xs font-bold uppercase tracking-widest">Loading secure recipe index...</span>
            </div>
          ) : filteredRecipes.length === 0 ? (
            <div className="py-20 text-center text-slate-400 border border-dashed border-slate-200 rounded-2xl">
              <BookOpen className="w-12 h-12 text-slate-200 mx-auto mb-3" />
              <p className="text-xs font-black uppercase tracking-widest text-slate-400">No recipes recorded yet</p>
              <p className="text-[10px] text-slate-500 mt-1 max-w-sm mx-auto">Click "New Recipe" above to write them or build beautiful formulas with the help of Gemini AI.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredRecipes.map((r) => {
                const isSelected = selectedRecipe?.id === r.id;
                return (
                  <div
                    key={r.id}
                    onClick={() => { setSelectedRecipe(isSelected ? null : r); setScaleFactor(1); setScalePreset('1'); }}
                    className={cn(
                      "p-5 rounded-2xl border transition-all duration-300 flex flex-col justify-between cursor-pointer",
                      isSelected 
                        ? "border-blue-600 bg-blue-50/15 ring-1 ring-blue-500 shadow-md" 
                        : "border-slate-100 hover:border-slate-200 hover:shadow-sm"
                    )}
                  >
                    <div>
                      <div className="flex justify-between items-start gap-2 mb-2">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[9px] font-black uppercase tracking-widest rounded-md">
                          {r.category || 'Other'}
                        </span>
                        {profile?.role === 'bakery_admin' && (
                          <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => startEdit(r)}
                              className="text-[9px] font-black text-blue-600 hover:underline uppercase"
                            >
                              Edit
                            </button>
                            <span>•</span>
                            <button
                              onClick={() => handleDeleteRecipe(r.id, r.name)}
                              className="text-[9px] font-black text-red-500 hover:underline uppercase"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                      
                      <h3 className="font-extrabold text-slate-900 text-sm tracking-tight mb-1">{r.name}</h3>
                      {r.description && <p className="text-[11px] text-slate-500 line-clamp-2 mb-3 leading-relaxed">{r.description}</p>}
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex justify-between items-center">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                        {r.ingredients.length} Ing • Step-by-Step
                      </span>
                      <span className="text-[9px] font-bold text-slate-600 uppercase bg-slate-50 px-2 py-1 rounded">
                        Yield: {r.yield || '1 default'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Active Detail Modal/Drawer inside Layout */}
          <AnimatePresence>
            {selectedRecipe && (
              <motion.div 
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 15 }}
                className="mt-6 border-t border-slate-200 pt-6"
              >
                <div className="bg-slate-50/50 rounded-[2rem] border border-slate-200 p-6 relative">
                  <button
                    onClick={() => { setSelectedRecipe(null); setScaleFactor(1); }}
                    className="absolute top-4 right-4 p-2 bg-white border border-slate-200 hover:bg-slate-50 hover:shadow-sm rounded-full cursor-pointer"
                  >
                    <X className="w-4 h-4 text-slate-500" />
                  </button>

                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[9px] font-black uppercase tracking-widest bg-blue-100 text-blue-700 px-2.5 py-0.5 rounded-md">
                          {selectedRecipe.category || 'Other'}
                        </span>
                        <span className="text-[9px] font-bold text-slate-500">
                          Recorded: {selectedRecipe.createdAt?.toDate ? selectedRecipe.createdAt.toDate().toLocaleDateString() : 'N/A'}
                        </span>
                      </div>
                      <h3 className="text-xl font-black text-slate-950 tracking-tight uppercase">{selectedRecipe.name}</h3>
                      {selectedRecipe.description && <p className="text-xs text-slate-600 mt-1 max-w-2xl">{selectedRecipe.description}</p>}
                    </div>
                    
                    {/* Prints & Export details for actual staff */}
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={handlePrint}
                        className="bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 text-[10px] font-black uppercase tracking-widest px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-sm"
                      >
                        <Printer className="w-4 h-4" />
                        Print Card
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="p-3 bg-white border border-slate-100 rounded-xl">
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block">Prep Period</span>
                      <span className="font-extrabold text-slate-850 text-xs">{selectedRecipe.prepTime || 'N/A'}</span>
                    </div>
                    <div className="p-3 bg-white border border-slate-100 rounded-xl">
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block">Baking / Proofing</span>
                      <span className="font-extrabold text-slate-850 text-xs">{selectedRecipe.bakingTime || 'N/A'}</span>
                    </div>
                    <div className="p-3 bg-white border border-slate-100 rounded-xl">
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block">Original Yield</span>
                      <span className="font-extrabold text-slate-850 text-xs">{selectedRecipe.yield || 'N/A'}</span>
                    </div>
                  </div>

                  {/* SCALER CALCULATOR CONTROLS */}
                  <div className="bg-blue-50/40 border border-blue-100 rounded-2xl p-4 mb-6">
                    <div className="flex items-center gap-2 mb-3">
                      <Calculator className="w-4 h-4 text-blue-600" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-blue-800">Mixer Scale Calculator (Dynamic Yield Adjuster)</span>
                    </div>
                    <p className="text-[11px] text-slate-600 mb-4">Input scaling size to increase/decrease ingredient volumes. Great for producing large commercial batches on demand in the bakery.</p>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                      <div className="flex flex-1 items-center bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-sm">
                        <Scale className="w-4 h-4 text-slate-400 mr-2 flex-shrink-0" />
                        <span className="text-xs font-bold text-slate-500 mr-2 uppercase">Multiplier:</span>
                        <input
                          type="number"
                          step="any"
                          min="0.01"
                          value={scaleFactor}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setScaleFactor(val > 0 ? val : 1);
                            setScalePreset('custom');
                          }}
                          className="w-16 text-xs font-black text-slate-900 focus:outline-none"
                        />
                        <span className="text-xs font-bold text-slate-900">x</span>
                      </div>
                      
                      <div className="flex gap-1 bg-white border border-slate-200/80 p-1.5 rounded-xl shadow-sm">
                        {['1', '2', '5', '10', '25'].map(p => (
                          <button
                            key={p}
                            onClick={() => { setScalePreset(p); setScaleFactor(Number(p)); }}
                            className={cn(
                              "px-2.5 py-1 text-[9px] font-black rounded-lg transition-all",
                              scalePreset === p ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50"
                            )}
                          >
                            {p}x
                          </button>
                        ))}
                      </div>

                      {/* AI-Assisted Scale calculation button */}
                      <button
                        onClick={handleAiScaleScale}
                        disabled={scalingAiRunning}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-[9px] font-black uppercase tracking-widest py-2.5 px-4 rounded-xl flex items-center justify-center gap-1 cursor-pointer transition-colors shadow-sm disabled:bg-slate-400"
                      >
                        {scalingAiRunning ? (
                          <>
                            <RefreshCcw className="w-3 animate-spin" /> Scaling...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3 h-3 text-amber-200" /> Apply AI Precise Math
                          </>
                        )}
                      </button>
                    </div>

                    {scaleFactor !== 1 && (
                      <div className="text-[10px] text-blue-700 font-bold mt-2 bg-blue-100/40 p-2.5 rounded-lg flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5" /> Showing scaled ingredients below for {scaleFactor}x original size. 
                        {scaleFactor > 1 ? `(Yield upgraded to ${scaleFactor}x larger!)` : `(Yield cut to ${scaleFactor}x smaller!)`}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                    {/* Scaled Ingredients Output column */}
                    <div className="md:col-span-4 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                      <h4 className="font-extrabold text-xs text-slate-900 uppercase tracking-wider mb-3 pb-2 border-b border-slate-100 flex items-center justify-between">
                        <span>Ingredients List</span>
                        {scaleFactor !== 1 && <span className="text-[9px] font-black text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">SCALED</span>}
                      </h4>
                      <ul className="space-y-2">
                        {selectedRecipe.ingredients.map((ing, idx) => {
                          const originalAmount = ing.amount;
                          const scaledAmount = Number((originalAmount * scaleFactor).toFixed(2));
                          return (
                            <li key={idx} className="flex justify-between items-center text-xs py-1 border-b border-slate-50 text-slate-700">
                              <span className="font-medium">{ing.name}</span>
                              <span className="font-black text-slate-900 bg-slate-50 px-2 py-0.5 rounded">
                                {scaledAmount} {ing.unit}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>

                    {/* Instructions column */}
                    <div className="md:col-span-8 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                      <h4 className="font-extrabold text-xs text-slate-900 uppercase tracking-wider mb-3 pb-2 border-b border-slate-100">
                        Kitchen Steps & Production Process
                      </h4>
                      <ol className="space-y-3">
                        {selectedRecipe.instructions.map((step, idx) => (
                          <li key={idx} className="flex items-start gap-3 text-xs leading-relaxed text-slate-700">
                            <span className="w-5 h-5 flex items-center justify-center bg-blue-100/60 rounded-full font-bold text-[10px] text-blue-700 mt-0.5 flex-shrink-0">
                              {idx+1}
                            </span>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6 pt-4 border-t border-slate-100 text-xs">
                    <div>
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">ALLERGENS</span>
                      <p className="font-bold text-slate-700">{selectedRecipe.allergenInfo || 'None Specified'}</p>
                    </div>
                    <div>
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">CHEF GUIDANCE</span>
                      <p className="text-slate-600 bg-slate-50/80 p-2.5 rounded-xl border border-slate-100 italic">{selectedRecipe.aiTips || 'Work clean. Keep mixers exact.'}</p>
                    </div>
                  </div>

                  {/* BEAUTIFUL NUTRITION FACTS SECTION */}
                  <div className="mt-6 border-t border-slate-105 pt-4">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2.5">Recipe Nutrition Facts (Per Serving)</span>
                    {selectedRecipe.nutrition ? (
                      <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-sm relative overflow-hidden font-sans">
                        <div className="absolute right-0 bottom-0 translate-y-3 translate-x-3 w-32 h-32 bg-slate-800/60 rounded-full blur-xl pointer-events-none" />
                        
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-800 pb-3 mb-4 gap-2">
                          <div>
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Active Analysis</span>
                            <h5 className="text-sm font-black text-white uppercase tracking-tight">Standard Nutrition Board</h5>
                          </div>
                          <div className="bg-slate-800/80 px-3.5 py-1 rounded-xl border border-slate-700/50">
                            <span className="text-[10px] font-black uppercase text-amber-400">Serving Size: {selectedRecipe.nutrition.servingSize || "1 Portion"}</span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                          <div className="border-r border-slate-850/60 last:border-0 pr-2">
                            <span className="text-[9px] font-extrabold uppercase text-slate-400 block tracking-wider">Calories</span>
                            <span className="text-xl font-black text-amber-300">{selectedRecipe.nutrition.calories ?? '—'} <span className="text-[10px] font-medium text-slate-400">kcal</span></span>
                          </div>
                          <div className="border-r border-slate-850/60 last:border-0 pr-2">
                            <span className="text-[9px] font-extrabold uppercase text-slate-400 block tracking-wider">Protein</span>
                            <span className="text-xl font-black text-emerald-400">{selectedRecipe.nutrition.protein ?? '—'} <span className="text-[10px] font-medium text-slate-400">g</span></span>
                          </div>
                          <div className="border-r border-slate-850/60 last:border-0 pr-2">
                            <span className="text-[9px] font-extrabold uppercase text-slate-400 block tracking-wider">Total Carbs</span>
                            <span className="text-xl font-black text-blue-400">{selectedRecipe.nutrition.carbs ?? '—'} <span className="text-[10px] font-medium text-slate-400">g</span></span>
                          </div>
                          <div className="border-r border-slate-850/60 last:border-0 pr-2">
                            <span className="text-[9px] font-extrabold uppercase text-slate-400 block tracking-wider">Fat</span>
                            <span className="text-xl font-black text-red-400">{selectedRecipe.nutrition.fat ?? '—'} <span className="text-[10px] font-medium text-slate-400">g</span></span>
                          </div>
                          <div className="border-r border-slate-850/60 last:border-0 pr-2">
                            <span className="text-[9px] font-extrabold uppercase text-slate-400 block tracking-wider">Dietary Fiber</span>
                            <span className="text-xl font-black text-teal-400">{selectedRecipe.nutrition.fiber ?? '—'} <span className="text-[10px] font-medium text-slate-400">g</span></span>
                          </div>
                          <div>
                            <span className="text-[9px] font-extrabold uppercase text-slate-400 block tracking-wider">Sugars</span>
                            <span className="text-xl font-black text-purple-400">{selectedRecipe.nutrition.sugar ?? '—'} <span className="text-[10px] font-medium text-slate-400">g</span></span>
                          </div>
                        </div>

                        {/* Direct Re-calculate button */}
                        <div className="mt-4 pt-3 border-t border-slate-800/80 flex justify-end">
                          <button
                            onClick={handleDirectCalculateNutrition}
                            disabled={photoAnalyzing}
                            className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-[9px] font-bold uppercase tracking-wider px-3.5 py-1.5 rounded-lg transition-transform hover:scale-101 border border-slate-700/65 cursor-pointer disabled:opacity-40"
                          >
                            {photoAnalyzing ? "Recalculating..." : "🔄 Re-calculate macros"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-slate-100 border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div>
                          <p className="text-xs font-black text-slate-800 uppercase tracking-tight mb-0.5">No nutrition facts calculated yet</p>
                          <p className="text-[11px] text-slate-500">Would you like Gemini AI to analyze your ingredients list and estimate calories and macros?</p>
                        </div>
                        <button
                          onClick={handleDirectCalculateNutrition}
                          disabled={photoAnalyzing}
                          className="w-full sm:w-auto bg-slate-900 hover:bg-slate-800 text-white text-[9px] font-black uppercase tracking-widest px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer disabled:bg-slate-400"
                        >
                          {photoAnalyzing ? (
                            <>
                              <RefreshCcw className="w-3.5 h-3.5 animate-spin" />
                              Calculating Macros...
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                              Calculate with AI
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* EGGLESS / VEGAN CONVERSION ASSISTANT */}
                  <div className="mt-6 p-4 bg-emerald-50/40 border border-emerald-100 rounded-2xl">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="w-4 h-4 text-emerald-600" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-emerald-800">AI Conversion Assistant</span>
                    </div>
                    <p className="text-[11px] text-slate-600 mb-3">Convert this recipe instantaneously into an allergy-friendly or custom-diet alternative variant. Gemini will dynamically substitute binders, proteins, or flours safely.</p>
                    
                    <div className="flex flex-wrap sm:flex-nowrap items-center gap-3">
                      <div className="flex-1 min-w-[200px]">
                        <select
                          value={substituteType}
                          onChange={(e) => setSubstituteType(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-emerald-500"
                        >
                          <option value="eggless">Eggless Substitution (commercial grade)</option>
                          <option value="vegan">Vegan Substitutes (plant-based milk & fats)</option>
                          <option value="gluten-free">Gluten-Free Substitutes (alternative grains)</option>
                          <option value="low-sugar">Low Sugar alternatives</option>
                        </select>
                      </div>

                      <button
                        onClick={handleAiSubstitution}
                        disabled={substitutingRunning || !selectedRecipe}
                        className={cn(
                          "px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-white transition-all flex items-center justify-center gap-1 cursor-pointer",
                          substitutingRunning ? "bg-slate-450 animate-pulse" : "bg-emerald-600 hover:bg-emerald-700"
                        )}
                      >
                        {substitutingRunning ? (
                          <>
                            <RefreshCcw className="w-3 animate-spin" /> Substituting...
                          </>
                        ) : (
                          <>
                            Generate Alternative Variant <ArrowRight className="w-3.5 h-3.5" />
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                </div>
              </motion.div>
            )}
          </AnimatePresence>

        </div>

      </div>

    </div>
  );
};
