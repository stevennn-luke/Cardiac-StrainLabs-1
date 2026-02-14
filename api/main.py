import os
import joblib
import pandas as pd
import numpy as np

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI()

origins = [
    "http://localhost",
    "http://localhost:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MODEL = None

def load_model():
    """Load the Scikit-Learn model (lazy loading)"""
    global MODEL
    if MODEL is None:
        try:
            print("="*50)
            print("Loading cardiac risk model...")
            
            # Use relative path from api/main.py to training models/Model-2.pkl
            # assuming main.py is in /api/ and training models is in /training models/
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            model_path = os.path.join(base_dir, "training models", "Model-2.pkl")
            
            print(f"Model path: {model_path}")
            print(f"File exists: {os.path.exists(model_path)}")
            
            MODEL = joblib.load(model_path)
            
            print("✓ Model loaded successfully!")
            print(f"Model type: {type(MODEL)}")
            print("="*50)
            
        except Exception as e:
            print(f"✗ ERROR loading model: {str(e)}")
            import traceback
            traceback.print_exc()
            raise RuntimeError(f"Failed to load model: {str(e)}")
    
    return MODEL

@app.get("/ping")
async def ping():
    return "Hello, I am alive (Scikit-Learn Backend)"

@app.post("/analyze")
async def analyze(data: dict):
    """Analyze patient data and return predictions"""
    try:
        model = load_model()
        
        print("="*50)
        print("Analyzing patient data...")
        print(f"Patient: {data.get('name')}")
        
        # Extract features in the correct order: Age, BMI, PROBNP, EF, GLS, NFATC3
        age = float(data.get('age', 0))
        bmi = float(data.get('bmi', 0))
        clinical = data.get('clinicalParameters', {})
        
        probnp = float(clinical.get('proBNP', 0))
        ef = float(clinical.get('ef', 0))
        gls = float(clinical.get('gls', 0))
        nfatc3 = float(clinical.get('nfatc3', 0))
        
        print(f"Features: Age={age}, BMI={bmi}, PROBNP={probnp}, EF={ef}, GLS={gls}, NFATC3={nfatc3}")
        
        # Create input array
        input_data = pd.DataFrame([{
            'Age': age,
            'BMI': bmi,
            'PROBNP': probnp,
            'EF': ef,
            'GLS': gls,
            'NFATC3': nfatc3
        }])
        
        # Predict
        prediction_class = model.predict(input_data)[0]
        
        # Get probability if available
        confidence = 0.0
        if hasattr(model, 'predict_proba'):
            probs = model.predict_proba(input_data)[0]
            confidence = float(np.max(probs))
            print(f"Probabilities: {probs}")
        else:
            confidence = 1.0 # Default if no proba
            
        print(f"Prediction Class: {prediction_class}")

        # Map prediction to response
        # Assuming classes map to: 0 -> Normal, 1 -> Moderate, 2 -> High (or string labels)
        
        # Check if prediction is string or int/float
        pred_str = str(prediction_class).lower()
        
        category = "Unknown"
        recommendation = ""
        prediction_label = "Unknown"
        
        # Handle string labels if the model returns them directly (e.g. 'Normal', 'High')
        if 'normal' in pred_str:
            category = "Normal Risk"
            prediction_label = "Normal"
            recommendation = "Continue routine health monitoring and maintain a healthy lifestyle; no pharmacological therapy is indicated at this stage."
            risk_score = 10 # Low pseudo score
        elif 'moderate' in pred_str:
            category = "Moderate Risk"
            prediction_label = "Monitor"
            recommendation = "Cardiology consultation is advised for early evaluation, lifestyle modification, and consideration of SGLT2-inhibitors and mineralocorticoid receptor antagonists (MRAs) as clinically indicated"
            risk_score = 45 # Moderate pseudo score
        elif 'high' in pred_str:
            category = "High Risk"
            prediction_label = "Attention Required"
            recommendation = "Urgent cardiology referral is recommended for comprehensive heart-failure evaluation, consideration of guideline-directed medical therapy, and further investigations including coronary angiography as clinically indicated."
            risk_score = 85 # High pseudo score
        else:
            # Fallback for integer encoding (likely LabelEncoder alphabetical: High=0, Moderate=1, Normal=2)
            if int(prediction_class) == 0:
                 category = "Normal Risk"
                 prediction_label = "Normal"
                 recommendation = "Continue routine health monitoring and maintain a healthy lifestyle; no pharmacological therapy is indicated at this stage."
                 risk_score = 10
            elif int(prediction_class) == 1:
                 category = "Moderate Risk"
                 prediction_label = "Monitor"
                 recommendation = "Cardiology consultation is advised for early evaluation, lifestyle modification, and consideration of SGLT2-inhibitors and mineralocorticoid receptor antagonists (MRAs) as clinically indicated"
                 risk_score = 45
            else:
                 # Class 2 -> High
                 category = "High Risk"
                 prediction_label = "Attention Required"
                 recommendation = "Urgent cardiology referral is recommended for comprehensive heart-failure evaluation, consideration of guideline-directed medical therapy, and further investigations including coronary angiography as clinically indicated."
                 risk_score = 85

        results = {
            "risk_score": risk_score, # Providing a pseudo score for UI compatibility
            "prediction": prediction_label,
            "confidence": confidence,
            "category": category,
            "recommendation": recommendation,
            "model_version": "2.0.0 (Scikit-Learn)",
            "timestamp": "2026-01-19"
        }
        
        print("✓ Analysis complete!")
        print(f"Results: {results}")
        print("="*50)
        
        return results
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {
            'error': str(e),
            'message': 'Failed to analyze patient data',
            'traceback': traceback.format_exc()
        }
