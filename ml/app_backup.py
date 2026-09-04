from fastapi import FastAPI
from pydantic import BaseModel, Field
import joblib, os

app=FastAPI(title='GiriDrishti ML Service')
model=joblib.load(os.path.join(os.path.dirname(__file__),'model.joblib')) if os.path.exists(os.path.join(os.path.dirname(__file__),'model.joblib')) else None

class Features(BaseModel):
    rainfall: float = Field(ge=0)
    soilMoisture: float = Field(ge=0, le=100)
    slope: float = Field(ge=0)
    elevation: float = Field(ge=0)
    historicalRisk: float = Field(ge=0)

@app.get('/health')
def health(): return {'ok':True,'modelLoaded':model is not None}

@app.post('/predict')
def predict(f: Features):
    if model is None: raise RuntimeError('Run train.py first')
    X=[[f.rainfall,f.soilMoisture,f.slope,f.elevation,f.historicalRisk]]
    p=float(model.predict_proba(X)[0][1])
    score=round(p*100)
    level='CRITICAL' if p>=.8 else 'HIGH' if p>=.6 else 'MODERATE' if p>=.4 else 'LOW'
    return {'probability':round(p,4),'riskScore':score,'riskLevel':level}
