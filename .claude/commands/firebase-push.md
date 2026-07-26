Push today's daily.json to Firebase manually (when Netlify hasn't run yet).

```bash
cd /c/Users/dctm1/YongStudyApp
node -e "
const fs=require('fs');require('dotenv').config();
const {initializeApp}=require('firebase/app');
const {getDatabase,ref,set}=require('firebase/database');
const app=initializeApp({databaseURL:process.env.FIREBASE_DATABASE_URL,apiKey:process.env.FIREBASE_API_KEY,projectId:'yongstudy-1f242'});
const db=getDatabase(app);
const data=JSON.parse(fs.readFileSync('investment/daily.json','utf8'));
const today=new Date(Date.now()+9*3600000).toISOString().split('T')[0];
set(ref(db,'investment/columns/'+today),data[today]).then(()=>{console.log('Done:',today);process.exit(0);})
"
```
