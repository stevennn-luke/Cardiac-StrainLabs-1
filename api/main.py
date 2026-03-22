
import os
import joblib
import pandas as pd
import numpy as np
from google.cloud import storage

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# GCS Configuration
BUCKET_NAME = "cardiac-strainlabs-486917-models"
MODEL_FILE = "heart_lr_dm.pkl"
SCALER_FILE = "scaler_lr_dm.pkl"
FEATURES_FILE = "feature_cols_lr_dm.pkl"

LOCAL_MODEL_PATH = "heart_lr_dm.pkl"
LOCAL_SCALER_PATH = "scaler_lr_dm.pkl"
LOCAL_FEATURES_PATH = "feature_cols_lr_dm.pkl"

MODEL = None
SCALER = None
FEATURES = None

def download_model():
    """Download model files from GCS bucket if not exists"""
    try:
        client = storage.Client()
        bucket = client.bucket(BUCKET_NAME)
        
        files_to_download = [
            (MODEL_FILE, LOCAL_MODEL_PATH),
            (SCALER_FILE, LOCAL_SCALER_PATH),
            (FEATURES_FILE, LOCAL_FEATURES_PATH)
        ]
        
        for gcs_file, local_path in files_to_download:
            if not os.path.exists(local_path):
                print(f"Downloading from gs://{BUCKET_NAME}/{gcs_file}...")
                blob = bucket.blob(gcs_file)
                blob.download_to_filename(local_path)
                print(f"{gcs_file} downloaded successfully.")
            else:
                print(f"{local_path} already exists locally.")
    except Exception as e:
        print(f"Error downloading models: {e}")
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        
        files_to_download = [
            (MODEL_FILE, LOCAL_MODEL_PATH),
            (SCALER_FILE, LOCAL_SCALER_PATH),
            (FEATURES_FILE, LOCAL_FEATURES_PATH)
        ]
        for gcs_file, local_path in files_to_download:
            local_dev_path = os.path.join(base_dir, "training models", gcs_file)
            if os.path.exists(local_dev_path):
                 print(f"Using local dev model from {local_dev_path}")
                 import shutil
                 shutil.copy(local_dev_path, local_path)

def load_model():
    """Load the model files into memory"""
    global MODEL, SCALER, FEATURES
    if MODEL is None:
        download_model()
        if os.path.exists(LOCAL_MODEL_PATH):
            try:
                MODEL = joblib.load(LOCAL_MODEL_PATH)
                SCALER = joblib.load(LOCAL_SCALER_PATH)
                FEATURES = joblib.load(LOCAL_FEATURES_PATH)
                print("Models loaded into memory.")
                print(f"Model type: {type(MODEL)}")
                print(f"Scaler type: {type(SCALER)}")
                print(f"Features list: {FEATURES}")
            except Exception as e:
                print(f"Failed to load model files: {e}")
        else:
            print("Model files not found locally after download attempt.")
    return MODEL, SCALER, FEATURES

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
        model, scaler, feature_cols = load_model()
        if model is None:
            raise RuntimeError("Model artifact not loaded")

        print("="*50)
        print("Analyzing patient data (Local GCS Model)...")
        print(f"Patient: {data.get('name')}")
        
        # Extract features
        age = float(data.get('age', 0))
        bmi = float(data.get('bmi', 0))
        clinical = data.get('clinicalParameters', {})
        
        # Parse clinical params
        probnp = float(clinical.get('proBNP', 0))
        ef = float(clinical.get('ef', 0))
        gls = float(clinical.get('gls', 0))
        nfatc3 = float(clinical.get('nfatc3', 0))
        
        dm_val = clinical.get('dm', 0)
        try:
            dm = float(dm_val)
        except:
            if str(dm_val).lower() in ['yes', 'y', 'true', 'present', '1']:
                dm = 1.0
            else:
                dm = 0.0

        print(f"Features Raw: Age={age}, BMI={bmi}, DM={dm}, PROBNP={probnp}, EF={ef}, GLS={gls}, NFATC3={nfatc3}")
        
        input_dict = {
            'Age': age,
            'BMI': bmi,
            'PROBNP': probnp,
            'EF': ef,
            'GLS': gls,
            'NFATC3': nfatc3,
            'DM': dm
        }


        formatted_input = {col: input_dict.get(col, 0) for col in feature_cols}
        input_data = pd.DataFrame([formatted_input])
        

        if scaler:
            print("Applying scaler transform...")
            try:
                input_scaled = scaler.transform(input_data)
            except Exception as e:
                print(f"Warning: Scaler transform failed: {e}. Using raw data.")
                input_scaled = input_data
        else:
            input_scaled = input_data

        prediction_class = model.predict(input_scaled)[0]
        
        confidence = 0.0
        if hasattr(model, 'predict_proba'):
            probs = model.predict_proba(input_scaled)[0]
            confidence = float(np.max(probs))
            print(f"Probabilities: {probs}")
        else:
            confidence = 1.0 
            
        print(f"Prediction Class: {prediction_class}")

        pred_str = str(prediction_class).lower()
        
        category = "Unknown"
        recommendation = ""
        prediction_label = "Unknown"
        risk_score = 0
        

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
            "model_version": "2.2.0 (GCS LogisticRegression w/ Scaler)",
            "timestamp": "2026-03-17"
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
