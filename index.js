require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
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
    const trainerCollection = db.collection("trainer");
    const classCollection = db.collection("class");
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

    app.get("/trainer", async (req, res) => {
      const result = await trainerCollection
        .find({ status: "trainer" })
        .sort({ createdAt: -1 })
        .toArray();

      res.send(result);
    });

    app.get("/pending-trainer", async (req, res) => {
      try {
        const result = await trainerCollection
          .find({ status: "pending" })

          .toArray();

        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to fetch pending trainers." });
      }
    });

    app.get("/class", async (req, res) => {
      const result = await classCollection
        .find()
        .sort({ createdAt: -1 })
        .toArray();

      res.send(result);
    });

    app.get("/trainer/:id", async (req, res) => {
      const id = req.params.id;

      const query = { _id: new ObjectId(id) };
      const result = await trainerCollection.findOne(query);

      res.send(result);
    });
    app.get("/pending/:id", async (req, res) => {
      const id = req.params.id;

      const query = { _id: new ObjectId(id) };
      const result = await trainerCollection.findOne(query);

      res.send(result);
    });



app.get("/my-trainer-application", async (req, res) => {
 
  try {
    const result = await trainerCollection.find({
    
      status: { $in: ["pending", "rejected"] } // exclude approved
    }).toArray();

    res.send(result);
  } catch (error) {
    res.status(500).send({ error: "Failed to load application status" });
  }
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
    app.post("/trainer", verifyToken, async (req, res) => {
      const trainerData = req.body;

      const result = await trainerCollection.insertOne(trainerData);

      res.send(result);
    });

    // -------------------------------------// patch method all _________________________

   


    app.patch("/trainer/approve/:id", async (req, res) => {
      const id = req.params.id;

      try {
        // Step 1: Get the trainer data first to find the email
        const trainer = await trainerCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!trainer) {
          return res.status(404).send({ error: "Trainer not found" });
        }

        const email = trainer.email;

        console.log(email);

        // Step 2: Update trainerCollection status
        const trainerUpdateResult = await trainerCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: "trainer" } }
        );

        // Step 3: Update usersCollection role
        const userUpdateResult = await usersCollection.updateOne(
          { email: email },
          { $set: { role: "trainer" } }
        );

        res.send({
          trainerUpdate: trainerUpdateResult,
          userUpdate: userUpdateResult,
          message: "Trainer approved successfully",
        });
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Failed to approve trainer." });
      }
    });





     app.patch("/trainer/reject/:id", async (req, res) => {
  const id = req.params.id;
  const { feedback } = req.body;

  try {
    const result = await trainerCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          status: "rejected",
          feedback: feedback,
        },
      }
    );

    res.send({ message: "Trainer rejected successfully", result });
  } catch (error) {
    console.error("Error rejecting trainer:", error);
    res.status(500).send({ error: "Failed to reject trainer." });
  }
});

    // ------------------------------------- Delete method all ------------------

    app.delete("/trainer/:id", async (req, res) => {
      const id = req.params.id;

      try {
        const trainer = await trainerCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!trainer) {
          return res.status(404).send({ error: "Trainer not found" });
        }

        const email = trainer.email;

        // Step 2: Delete from trainerCollection
        const deleteResult = await trainerCollection.deleteOne({
          _id: new ObjectId(id),
        });

        // Step 3: Update user role in usersCollection
        const updateResult = await usersCollection.updateOne(
          { email: email },
          { $set: { role: "member" } }
        );

        res.send({
          message: "Trainer removed and user role set to member.",
          deleted: deleteResult,
          updated: updateResult,
        });
      } catch (error) {
        console.error("Error deleting trainer:", error);
        res.status(500).send({ error: "Failed to delete trainer." });
      }
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
