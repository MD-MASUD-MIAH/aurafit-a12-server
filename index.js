 const express = require('express')

  const app = express() 
  const cors = require('cors')


  const port = process.env.PORT || 4000 


//   meddleWare  

   app.use(cors()) 
   app.use(express.json()) 


   app.get('/',async(req,res)=>{

    res.send('welcome to my one more now project Fitness Tracker');
    
   })










   app.listen(port,()=>{

    console.log(`this project is running  port number ${port}`);
    
   })