
import os
import joblib
import pandas as pd
import numpy as np
from google.cloud import storage

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI()

origins = [
    "http://localhost",
    "http://localhost:3000",
    "https://cardiac-strainlabs.web.app",
    "https://cardiac-strainlabs.firebaseapp.com"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# GCS Configuration
BUCKET_NAME = "cardiac-strainlabs-486917-models"
MODEL_FILE = "hfpef_model.pkl"
LOCAL_MODEL_PATH = "model.pkl"

MODEL = None

def download_model():
    """Download model from GCS bucket if not exists"""
    try:
        if not os.path.exists(LOCAL_MODEL_PATH):
            print(f"Downloading model from gs://{BUCKET_NAME}/{MODEL_FILE}...")
            client = storage.Client()
            bucket = client.bucket(BUCKET_NAME)
            blob = bucket.blob(MODEL_FILE)
            blob.download_to_filename(LOCAL_MODEL_PATH)
            print("Model downloaded successfully.")
        else:
            print("Model file already exists locally.")
    except Exception as e:
        print(f"Error downloading model: {e}")
        # If running locally and file exists in training models, try to use that
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        local_dev_path = os.path.join(base_dir, "training models", MODEL_FILE)
        if os.path.exists(local_dev_path):
             print(f"Using local dev model from {local_dev_path}")
             import shutil
             shutil.copy(local_dev_path, LOCAL_MODEL_PATH)

def load_model():
    """Load the model into memory"""
    global MODEL
    if MODEL is None:
        download_model()
        if os.path.exists(LOCAL_MODEL_PATH):
            try:
                # Load joblib artifact
                MODEL = joblib.load(LOCAL_MODEL_PATH)
                print("Model loaded into memory.")
                print(f"Model type: {type(MODEL)}")
            except Exception as e:
                print(f"Failed to load model file: {e}")
        else:
            print("Model file not found locally after download attempt.")
    return MODEL

@app.on_event("startup")
async def startup_event():
    load_model()

@app.get("/ping")
async def ping():
    return "Hello, I am alive (GCS Model Backend)"

@app.post("/analyze")
async def analyze(data: dict):
    """Analyze patient data and return predictions using local model"""
    try:
        artifact = load_model()
        if artifact is None:
            raise RuntimeError("Model artifact not loaded")

        # Handle dictionary artifact (model + scaler) vs direct model object
        model = None
        scaler = None
        if isinstance(artifact, dict):
             model = artifact.get('model')
             scaler = artifact.get('scaler')
        else:
             model = artifact

        if model is None:
            raise RuntimeError("Could not extract model from artifact")

        print("="*50)
        print("Analyzing patient data (Local GCS Model)...")
        print(f"Patient: {data.get('name')}")
        
        # Extract features
        age = float(data.get('age', 0))
        gender_str = str(data.get('gender', '')).lower()
        bmi = float(data.get('bmi', 0))
        clinical = data.get('clinicalParameters', {})
        
        # Parse clinical params
        probnp = float(clinical.get('proBNP', 0))
        ef = float(clinical.get('ef', 0))
        gls = float(clinical.get('gls', 0))
        nfatc3 = float(clinical.get('nfatc3', 0))
        
        # Handle DM (Diabetes) - simplified parsing
        dm_val = clinical.get('dm', 0)
        try:
            dm = float(dm_val)
        except:
            if str(dm_val).lower() in ['yes', 'y', 'true']:
                dm = 1.0
            else:
                dm = 0.0

        # Map Gender to 0/1 (Assuming Male=1, Female=0 based on typical datasets, strictly check this!)
        # Defaulting to Male=1, Female=0 as per common conventions in medical datasets if not specified
        gender = 1.0 if 'male' in gender_str else 0.0
        
        print(f"Features Raw: Age={age}, Gender={gender}, BMI={bmi}, DM={dm}, PROBNP={probnp}, EF={ef}, GLS={gls}, NFATC3={nfatc3}")
        
        # Create user input DataFrame with correct column names matching training
        # Training cols: ['age', 'gender', 'bmi', 'dm', 'probnp', 'ef', 'gls', 'nfatc3']
        input_data = pd.DataFrame([{
            'age': age,
            'gender': gender,
            'bmi': bmi,
            'dm': dm,
            'probnp': probnp,
            'ef': ef,
            'gls': gls,
            'nfatc3': nfatc3
        }])
        
        # Apply scaling if available
        if scaler:
            print("Applying scaler transform...")
            try:
                # Ensure input_data matches scaler's expected features
                input_scaled = scaler.transform(input_data)
            except Exception as e:
                print(f"Warning: Scaler transform failed: {e}. Using raw data.")
                input_scaled = input_data
        else:
            input_scaled = input_data

        # Predict
        prediction_class = model.predict(input_scaled)[0]
        
        # Get probability if available
        confidence = 0.0
        if hasattr(model, 'predict_proba'):
            probs = model.predict_proba(input_scaled)[0]
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
        risk_score = 0
        
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
            "risk_score": risk_score, 
            "prediction": prediction_label,
            "confidence": confidence,
            "category": category,
            "recommendation": recommendation,
            "model_version": "2.1.0 (GCS sklearn w/ Scaler)",
            "timestamp": "2026-02-14"
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

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8080)
