
from fastapi import FastAPI, Request
import joblib
import pandas as pd
import os
import uvicorn
from google.cloud import storage

app = FastAPI()

MODEL = None
BUCKET_NAME = "cardiac-strainlabs-486917-models"
MODEL_FILE = "model.pkl"
LOCAL_MODEL_PATH = "/app/model.pkl"

def download_model():
    """Download model from GCS bucket"""
    try:
        if not os.path.exists(LOCAL_MODEL_PATH):
            print(f"Downloading model from gs://{BUCKET_NAME}/{MODEL_FILE}...")
            client = storage.Client()
            bucket = client.bucket(BUCKET_NAME)
            blob = bucket.blob(MODEL_FILE)
            blob.download_to_filename(LOCAL_MODEL_PATH)
            print("Model downloaded successfully.")
    except Exception as e:
        print(f"Error downloading model: {e}")

def load_model():
    global MODEL
    if MODEL is None:
        download_model()
        if os.path.exists(LOCAL_MODEL_PATH):
            MODEL = joblib.load(LOCAL_MODEL_PATH)
            print("Model loaded into memory.")
        else:
            print("Model file not found locally.")
    return MODEL

@app.on_event("startup")
async def startup_event():
    load_model()

@app.get("/health")
async def health():
    if MODEL is not None:
        return {"status": "healthy"}
    return {"status": "unhealthy"}, 503

@app.post("/predict")
async def predict(request: Request):
    try:
        body = await request.json()
        instances = body.get("instances", [])
        
        if not instances:
            return {"error": "No instances provided"}

        # Convert instances to DataFrame (assuming list of lists matching feature order)
        # Expected features: Age, BMI, PROBNP, EF, GLS, NFATC3
        feature_names = ['Age', 'BMI', 'PROBNP', 'EF', 'GLS', 'NFATC3']
        input_df = pd.DataFrame(instances, columns=feature_names)
        
        prediction = MODEL.predict(input_df)
        
        # Return predictions in format expected by Vertex AI
        return {"predictions": prediction.tolist()}
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"error": str(e)}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8080)
