
import joblib
import sys

try:
    model_path = 'training models/hfpef_model.pkl'
    print(f"Loading {model_path}...")
    model = joblib.load(model_path)
    print(f"Type: {type(model)}")
    
    if isinstance(model, dict):
        print(f"Keys: {model.keys()}")
        if 'model' in model:
            print(f"Model sub-key type: {type(model['model'])}")
    else:
        print("Model is not a dictionary.")
        
except Exception as e:
    print(f"Error: {e}")
