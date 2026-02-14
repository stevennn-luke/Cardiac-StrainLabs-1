import joblib
import os
import sys

try:
    path = "training models/Model-2.pkl"
    print(f"Loading {path}...")
    model = joblib.load(path)
    print(f"Model type: {type(model)}")
    
    if hasattr(model, 'classes_'):
        print(f"Classes found: {model.classes_}")
    else:
        print("Model does not have 'classes_' attribute.")

except Exception as e:
    print(f"Error: {e}")
