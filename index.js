 require('dotenv').config()
 const { MongoClient, ServerApiVersion } = require('mongodb');
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


const client = new MongoClient(process.env.MONGODB_URL, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});



async function run() {
  try {
      const db = client.db('fitnessData')
      const usersCollection = db.collection('user')

        app.post('/user', async (req, res) => {
      const userData = req.body
      userData.role = 'member'
      userData.created_at = new Date().toISOString()
      userData.last_loggedIn = new Date().toISOString()
      const query = {
        email: userData?.email,
      }
      const alreadyExists = await usersCollection.findOne(query)
      console.log('User already exists: ', !!alreadyExists)
      if (!!alreadyExists) {
        console.log('Updating user data......')
        const result = await usersCollection.updateOne(query, {
          $set: { last_loggedIn: new Date().toISOString() },
        })
        return res.send(result)
      }

      console.log('Creating user data......')
      // return console.log(userData)
      const result = await usersCollection.insertOne(userData)
      res.send(result)
    })
 
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    
  }
}


run().catch(console.dir);






   



   app.listen(port,()=>{

    console.log(`this project is running  port number ${port}`);
    
   })