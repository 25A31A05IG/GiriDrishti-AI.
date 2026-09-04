import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report
import joblib

rng=np.random.default_rng(42)
n=5000
rain=rng.uniform(5,220,n)
soil=rng.uniform(10,100,n)
slope=rng.uniform(2,55,n)
elev=rng.uniform(10,3800,n)
hist=rng.integers(0,11,n)
score=.35*np.minimum(rain/180,1)+.25*soil/100+.22*np.minimum(slope/45,1)+.10*np.minimum(hist/10,1)+.08*np.minimum(elev/3500,1)
noise=rng.normal(0,.06,n)
y=(score+noise>0.52).astype(int)
X=pd.DataFrame({'rainfall':rain,'soilMoisture':soil,'slope':slope,'elevation':elev,'historicalRisk':hist})
Xtr,Xte,ytr,yte=train_test_split(X,y,test_size=.2,random_state=42,stratify=y)
model=RandomForestClassifier(n_estimators=250,max_depth=12,random_state=42,class_weight='balanced')
model.fit(Xtr,ytr)
pred=model.predict(Xte)
print('Demo validation accuracy:', round(accuracy_score(yte,pred),4))
print(classification_report(yte,pred))
joblib.dump(model,'model.joblib')
print('Saved model.joblib')
