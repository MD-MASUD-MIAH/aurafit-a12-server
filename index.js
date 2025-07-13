require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
const admin = require("firebase-admin");
const app = express();
const cors = require("cors");
const stripe = require("stripe")(process.env.STRIPE_SK_KEY);
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
    req.user = decoded;
  } catch {
    return res.status(401).send({ message: "unauthorized access" });
  }

  next();
};

app.get("/", async (req, res) => {
  res.send("welcome to my one more new project Fitness Tracker");
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
    const BookingCollection = db.collection("Booking");
    const reviewingCollection = db.collection("review");
    const forumCollection = db.collection("forum");

    app.post("/create-payment-intent", async (req, res) => {
      const formData = req.body;

      const amount = Number(formData.amount);
      if (isNaN(amount)) {
        return res.status(400).send({ error: "Invalid amount provided." });
      }

      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount * 100,
          currency: "usd",
          automatic_payment_methods: {
            enabled: true,
          },
        });

        res.send({ clientSecret: paymentIntent.client_secret });
      } catch (err) {
        console.error("Stripe error:", err);
        res.status(500).send({ error: err.message });
      }
    });

    //  get data

    app.get("/booked/:email", async (req, res) => {
      const userEmail = req.params.email;

      console.log(userEmail);

      try {
        const result = await BookingCollection.aggregate([
          {
            $match: { memberEmail: userEmail },
          },
          {
            $lookup: {
              from: "trainer",
              let: { trainerId: "$trainerId" },
              pipeline: [
                {
                  $match: {
                    $expr: { $eq: [{ $toString: "$_id" }, "$$trainerId"] },
                  },
                },
              ],
              as: "trainerDetails",
            },
          },
          {
            $addFields: {
              trainerId: { $toObjectId: "$trainerId" },
            },
          },
          {
            $unwind: {
              path: "$trainerDetails",
              preserveNullAndEmptyArrays: true,
            },
          },
        ]).toArray();

        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to fetch booking data" });
      }
    });

    app.get("/slots/:email", async (req, res) => {
      const email = req.params.email;

      try {
        const trainer = await trainerCollection.findOne({
          email: email,
          status: "trainer",
        });

        if (!trainer) {
          return res.status(404).send({ message: "Trainer not found" });
        }

        res.send(trainer);
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch trainer info" });
      }
    });

    app.get("/trainer-classes/:trainerId", async (req, res) => {
      const trainerId = req.params.trainerId;

      try {
        const trainer = await trainerCollection.findOne({
          _id: new ObjectId(trainerId),
        });

        if (!trainer) {
          return res.status(404).json({ message: "Trainer not found" });
        }

        const matchedSkills = trainer.skills;

        const classes = await classCollection
          .find({ skillName: { $in: matchedSkills } })
          .project({ className: 1, _id: 0 })
          .toArray();

        res.send(classes);
      } catch (error) {
        console.error("Error fetching classes for trainer:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    });

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
      try {
        const search = req.query.search || "";

        const pipeline = [];

        if (search) {
          pipeline.push({
            $match: {
              skillName: { $regex: search, $options: "i" },
            },
          });
        }

        // ✅ আগের aggregate স্টেপগুলো
        pipeline.push(
          {
            $lookup: {
              from: "trainer",
              let: { skill: { $toLower: "$skillName" } },
              pipeline: [
                {
                  $addFields: {
                    lowerSkills: {
                      $map: {
                        input: "$skills",
                        as: "s",
                        in: { $toLower: "$$s" },
                      },
                    },
                  },
                },
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $in: ["$$skill", "$lowerSkills"] },
                        { $eq: ["$status", "trainer"] },
                      ],
                    },
                  },
                },
                {
                  $project: {
                    fullName: 1,
                    photo: 1,
                    email: 1,
                    _id: 1,
                  },
                },
              ],
              as: "trainers",
            },
          },
          {
            $addFields: {
              trainers: { $slice: ["$trainers", 5] },
            },
          },
          {
            $project: {
              className: 1,
              skillName: 1,
              image: 1,
              details: 1,
              trainers: 1,
            },
          }
        );

        const result = await classCollection.aggregate(pipeline).toArray();

        res.send(result);
      } catch (error) {
        console.error("Error fetching classes with trainers:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
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
        const result = await trainerCollection
          .find({
            status: { $in: ["pending", "rejected"] }, // exclude approved
          })
          .toArray();

        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to load application status" });
      }
    });

    app.get("/class-names", async (req, res) => {
      try {
        const classNames = await classCollection
          .find({}, { projection: { name: 1, _id: 0 } })
          .toArray();

        res.send(classNames);
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch class names" });
      }
    });

    app.get("/trainer/bookings/:email", async (req, res) => {
      const trainerEmail = req?.params.email;

      console.log(trainerEmail);

      try {
        const result = await BookingCollection.find({
          trainerId: trainerEmail,
        }).toArray();

        res.send(result);
      } catch (error) {
        console.error("Error fetching bookings for trainer:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    app.get("/trainers-and-admins/:email", async (req, res) => {
      try {
        const email = req.params.email;

        const user = await usersCollection.findOne({
          email,
          role: { $in: ["trainer", "admin"] },
        });

        if (!user) {
          return res
            .status(404)
            .json({ message: "User not found or not authorized" });
        }

        res.status(200).json(user);
      } catch (error) {
        console.error("Error fetching user:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });
    app.get('/forums',async(req,res)=>{


      const result =  await forumCollection.g
    })

    // post data

    app.post("/bookings", async (req, res) => {
      const booking = req.body;

      try {
        const result = await BookingCollection.insertOne(booking);
        res.send({ insertedId: result.insertedId });
      } catch (error) {
        console.error("Booking insert error:", error);
        res.status(500).send({ error: "Failed to save booking" });
      }
    });
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

    app.post("/addClass", async (req, res) => {
      const ClassData = req.body;
      const result = await classCollection.insertOne(ClassData);

      res.send(result);
    });

    app.post("/review-post", async (req, res) => {
      const review = req.body;
      const result = await reviewingCollection.insertOne(review);
      res.send(result);
    });

    app.post('/forums',async  (req,res)=>{

      const forumsPost= req.body 
      console.log(forumsPost);
      const result =  await forumCollection.insertOne(forumsPost)
      res.send(result)

    }
           

    )
    // -------------------------------------// patch method all _ ________________________

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

    app.patch("/trainer/:email", async (req, res) => {
      const { email } = req.params;
      const { availableDays, timeSlots, classes, skills } = req.body;

      try {
        const result = await trainerCollection.updateOne(
          { email },
          {
            $set: {
              availableDays,
              timeSlots,

              skills, // <== Add this line
            },
          }
        );

        res.send(result);
      } catch (error) {
        console.error("Update error:", error);
        res.status(500).send({ message: "Failed to update trainer data" });
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

    app.delete("/slots/:email", verifyToken, async (req, res) => {
      try {
        const email = req.params.email;
        const slot = req.query.slot;

        console.log("server side", email, req.user.email, slot);

        // Check if the requesting user is authorized
        if (req?.user?.email !== email) {
          return res
            .status(403)
            .json({ message: "Unauthorized to delete slots" });
        }

        // Find the trainer
        const trainer = await trainerCollection.findOne({
          email,
          status: "trainer",
        });

        if (!trainer) {
          return res.status(404).json({ message: "Trainer not found" });
        }

        // Remove the slot from the array
        const updatedSlots = trainer.timeSlots.filter((s) => s !== slot);

        await trainerCollection.updateOne(
          { email },
          { $set: { timeSlots: updatedSlots } }
        );

        res.status(200).json({ message: "Slot deleted successfully" });
      } catch (error) {
        console.error("Error deleting slot:", error);
        res.status(500).json({ message: "Server error", error: error.message });
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
