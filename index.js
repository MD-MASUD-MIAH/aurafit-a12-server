require("dotenv").config();
const { MongoClient, ServerApiVersion } = require("mongodb");
const express = require("express");
const admin = require("firebase-admin");
const app = express();
const cors = require("cors");

const port = process.env.PORT || 4000;

//   meddleWare

app.use(express.json());
app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  })
);
const decoded = Buffer.from(process.env.FIT_SERVICE_KEY, "base64").toString(
  "utf8"
);
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const verifyToken = async (req, res, next) => {
  const authHeaders = req.headers.authorization;

  if (!authHeaders || !authHeaders.startsWith("Bearer ")) {
    return res.status(401).send({ message: "unauthorized access token" });
  }

  const token = authHeaders.split(" ")[1];

  console.log(token);

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.decoded = decoded;
  } catch {
    return res.status(401).send({ message: "unauthorized access" });
  }
  next();
};

app.get("/", async (req, res) => {
  res.send("welcome to my one more now project Fitness Tracker");
});

const client = new MongoClient(process.env.MONGODB_URL, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const db = client.db("fitnessData");
    const usersCollection = db.collection("user");
    const subscribersCollection = db.collection("subscribers");
    const TrainerCollection = db.collection("trainer");
    //  get data
    app.get("/user", async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    app.get("/subscribers", async (req, res) => {
      const result = await subscribersCollection
        .find()
        .sort({ createdAt: -1 })
        .toArray();

      res.send(result);
    });

    // post data
    app.post("/user", async (req, res) => {
      const userData = req.body;
      userData.role = "member";
      userData.created_at = new Date().toISOString();
      userData.last_loggedIn = new Date().toISOString();
      const query = {
        email: userData?.email,
      };
      const alreadySignUp = await usersCollection.findOne(query);
      console.log("User already exists: ", !!alreadySignUp);
      if (!!alreadySignUp) {
        console.log("Updating user data......");
        const result = await usersCollection.updateOne(query, {
          $set: { last_loggedIn: new Date().toISOString() },
        });
        return res.send(result);
      }

      console.log("Creating user data......");

      const result = await usersCollection.insertOne(userData);
      res.send(result);
    });

    app.post("/subscribers", async (req, res) => {
      const subscribersData = req.body;
      subscribersData.created_at = new Date().toISOString();
      subscribersData.status = "subscribed";
      const result = await subscribersCollection.insertOne(subscribersData);

      res.send(result);
    });
    app.post("/trainer", async (req, res) => {
      const trainerData = req.body;
      const result = await TrainerCollection.insertOne(trainerData);

      res.send(result);
    });

    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`this project is running  port number ${port}`);
});
