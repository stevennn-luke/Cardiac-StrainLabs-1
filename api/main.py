import os
import tempfile
import numpy as np
import cv2

from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import tensorflow as tf

class CompatibleBatchNormalization(tf.keras.layers.BatchNormalization):
    """Custom BatchNormalization layer that handles axis as list or int"""
    
    def __init__(self, axis=-1, **kwargs):
        if isinstance(axis, list):
            axis = axis[0] if len(axis) > 0 else -1
        super().__init__(axis=axis, **kwargs)
    
    @classmethod
    def from_config(cls, config):
        if 'axis' in config and isinstance(config['axis'], list):
            config = config.copy()
            config['axis'] = config['axis'][0] if len(config['axis']) > 0 else -1
        return cls(**config)
    
    def get_config(self):
        config = super().get_config()
        if isinstance(config.get('axis'), list):
            config['axis'] = config['axis'][0] if len(config['axis']) > 0 else -1
        return config


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

NUM_FRAMES = 10
FRAME_HEIGHT = 224
FRAME_WIDTH = 224

def load_model():
    """Load the TensorFlow model (lazy loading)"""
    global MODEL
    if MODEL is None:
        try:
            print("="*50)
            print("Loading attention detection model...")
            
            tf.config.threading.set_inter_op_parallelism_threads(1)
            tf.config.threading.set_intra_op_parallelism_threads(1)
            
            model_path = os.path.join(
                os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 
                "saved_models", "1", "model.h5"
            )
            
            print(f"Model path: {model_path}")
            print(f"File exists: {os.path.exists(model_path)}")
            
            MODEL = tf.keras.models.load_model(model_path, compile=False)
            
            print("✓ Model loaded successfully!")
            print(f"Model has {len(MODEL.layers)} layers")
            print("="*50)
            
        except Exception as e:
            print(f"✗ ERROR loading model: {str(e)}")
            import traceback
            traceback.print_exc()
            raise RuntimeError(f"Failed to load model: {str(e)}")
    
    return MODEL

@app.get("/ping")
async def ping():
    return "Hello, I am alive"

@app.post("/analyze")
async def analyze(data: dict):
    """Analyze patient data and return predictions"""
    try:
        print("="*50)
        print("Analyzing patient data...")
        print(f"Patient: {data.get('name')}")
        print(f"Age: {data.get('age')}")
        print(f"Gender: {data.get('gender')}")
        print(f"BMI: {data.get('bmi')}")
        print(f"Clinical Parameters: {data.get('clinicalParameters')}")
        
        
        bmi = float(data.get('bmi', 25))
        age = int(data.get('age', 30))
        
        risk_score = min(100, max(0, (bmi - 18.5) * 5 + (age - 30) * 0.5))
        
        if risk_score < 30:
            category = "Low Risk"
            prediction = "Normal"
            confidence = 0.85
            recommendation = "Continue maintaining a healthy lifestyle with regular exercise and balanced diet."
        elif risk_score < 60:
            category = "Moderate Risk"
            prediction = "Monitor"
            confidence = 0.75
            recommendation = "Regular monitoring recommended. Consider lifestyle modifications and consult with healthcare provider."
        else:
            category = "High Risk"
            prediction = "Attention Required"
            confidence = 0.80
            recommendation = "Medical consultation recommended. Immediate lifestyle changes and possible intervention needed."
        
        results = {
            "risk_score": risk_score,
            "prediction": prediction,
            "confidence": confidence,
            "category": category,
            "recommendation": recommendation,
            "model_version": "1.0.0",
            "timestamp": "2025-12-15T08:00:00Z"
        }
        
        print("✓ Analysis complete!")
        print(f"Results: {results}")
        print("="*50)
        
        return results
        
    except Exception as e:
        import traceback
        return {
            'error': str(e),
            'message': 'Failed to analyze patient data',
            'traceback': traceback.format_exc()
        }

def process_video_file(video_bytes) -> np.ndarray:
    with tempfile.NamedTemporaryFile(delete=False, suffix='.avi') as tmp_file:
        tmp_file.write(video_bytes)
        tmp_file_path = tmp_file.name
    
    try:
        cap = cv2.VideoCapture(tmp_file_path)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        
        if total_frames == 0:
            raise ValueError("Could not read video or video has no frames")
        
        frame_indices = np.linspace(0, total_frames - 1, NUM_FRAMES, dtype=int)
        frames = []
        
        for idx in frame_indices:
            cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
            ret, frame = cap.read()
            
            if ret:
                frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                frame_resized = cv2.resize(frame_rgb, (FRAME_WIDTH, FRAME_HEIGHT))
                frame_normalized = frame_resized.astype(np.float32) / 255.0
                frames.append(frame_normalized)
            else:
                if len(frames) > 0:
                    frames.append(frames[-1])
                else:
                    raise ValueError(f"Failed to read frame at index {idx}")
        
        cap.release()
        
        while len(frames) < NUM_FRAMES:
            frames.append(frames[-1])
        
        video_array = np.array(frames[:NUM_FRAMES])
        return video_array
    
    finally:
        if os.path.exists(tmp_file_path):
            os.remove(tmp_file_path)

@app.post("/predict_frame")
async def predict_frame(file: UploadFile = File(...)):
    """Predict from a single frame for real-time analysis"""
    try:
        image_bytes = await file.read()
        nparr = np.frombuffer(image_bytes, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if frame is None:
            return {
                'error': 'Invalid image',
                'message': 'Could not decode image'
            }
        
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        frame_resized = cv2.resize(frame_rgb, (FRAME_WIDTH, FRAME_HEIGHT))
        frame_normalized = frame_resized.astype(np.float32) / 255.0
        
        frames = [frame_normalized] * NUM_FRAMES
        video_array = np.array(frames)
        video_batch = np.expand_dims(video_array, 0)
        
        model = load_model()
        predictions = model.predict(video_batch, verbose=0)
        
        boredom_pred, engagement_pred, confusion_pred, frustration_pred, attention_pred = predictions
        
        boredom_level = int(np.argmax(boredom_pred[0]))
        engagement_level = int(np.argmax(engagement_pred[0]))
        confusion_level = int(np.argmax(confusion_pred[0]))
        frustration_level = int(np.argmax(frustration_pred[0]))
        attention_score = float(attention_pred[0][0])
        
        return {
            'boredom': {
                'level': boredom_level,
                'confidence': float(np.max(boredom_pred[0])),
                'probabilities': boredom_pred[0].tolist()
            },
            'engagement': {
                'level': engagement_level,
                'confidence': float(np.max(engagement_pred[0])),
                'probabilities': engagement_pred[0].tolist()
            },
            'confusion': {
                'level': confusion_level,
                'confidence': float(np.max(confusion_pred[0])),
                'probabilities': confusion_pred[0].tolist()
            },
            'frustration': {
                'level': frustration_level,
                'confidence': float(np.max(frustration_pred[0])),
                'probabilities': frustration_pred[0].tolist()
            },
            'attention_score': attention_score,
            'model_type': 'real-time'
        }
    
    except Exception as e:
        import traceback
        return {
            'error': str(e),
            'message': 'Failed to process frame',
            'traceback': traceback.format_exc()
        }

@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    try:
        if not file.filename.lower().endswith(('.mp4', '.avi')):
            return {
                'error': 'Invalid file type',
                'message': 'Please upload either an MP4 or AVI video file'
            }
            
        video_bytes = await file.read()
        video_frames = process_video_file(video_bytes)
        video_batch = np.expand_dims(video_frames, 0)
        
        model = load_model()
        predictions = model.predict(video_batch)
        
        boredom_pred, engagement_pred, confusion_pred, frustration_pred, attention_pred = predictions
        
        boredom_level = int(np.argmax(boredom_pred[0]))
        engagement_level = int(np.argmax(engagement_pred[0]))
        confusion_level = int(np.argmax(confusion_pred[0]))
        frustration_level = int(np.argmax(frustration_pred[0]))
        attention_score = float(attention_pred[0][0])
        
        return {
            'boredom': {
                'level': boredom_level,
                'confidence': float(np.max(boredom_pred[0])),
                'probabilities': boredom_pred[0].tolist()
            },
            'engagement': {
                'level': engagement_level,
                'confidence': float(np.max(engagement_pred[0])),
                'probabilities': engagement_pred[0].tolist()
            },
            'confusion': {
                'level': confusion_level,
                'confidence': float(np.max(confusion_pred[0])),
                'probabilities': confusion_pred[0].tolist()
            },
            'frustration': {
                'level': frustration_level,
                'confidence': float(np.max(frustration_pred[0])),
                'probabilities': frustration_pred[0].tolist()
            },
            'attention_score': attention_score,
            'frames_processed': NUM_FRAMES,
            'model_type': 'original',
            'model_info': {
                'total_params': 51608529,
                'model_size_mb': 196.87,
                'architecture': 'CNN + LSTM + Dense layers'
            }
        }
    
    except Exception as e:
        import traceback
        return {
            'error': str(e),
            'message': 'Failed to process video file',
            'traceback': traceback.format_exc()
        }

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=False, workers=1, loop="asyncio")
