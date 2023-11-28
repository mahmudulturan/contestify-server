const express = require('express');
require("dotenv").config()
const app = express();
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY)
const port = process.env.port || 5000

//middlewares
app.use(cors())
app.use(express.json())



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.hzybyvu.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    const contestCollection = client.db("contestifyDB").collection("contests")
    const userCollection = client.db("contestifyDB").collection("users")
    const participateCollection = client.db("contestifyDB").collection("participators")

    //users related api
    app.get('/users', async (req, res) => {
      const result = await userCollection.find().toArray()
      res.send(result)
    })

    app.get('/users/:email', async (req, res) => {
      const email = req.params.email;
      const query = { email: email }
      const result = await userCollection.findOne(query)
      res.send(result)
    })

    app.get('/get-winners', async (req, res) => {
      const email = req.query.email;
      let query = {
        $or: [
          { 'winner': { $exists: true, $ne: null } },
          { 'winner': 1 }
        ]
      };
      if (email) {
        query = { ['winner.email']: email }
      }
      const result = await contestCollection.find(query).toArray()
      res.send(result)
    })

    app.put('/users', async (req, res) => {
      const usersData = req.body;
      const email = req.body.email;
      const query = { email: email }
      const findUser = await userCollection.findOne(query)
      if (findUser) {
        return res.send({ status: "User Found" })
      }
      const result = await userCollection.insertOne(usersData);
      res.send(result);
    })

    app.patch('/users/:id', async (req, res) => {
      const id = req.params.id;
      const data = req.body;
      const role = data.role
      const image = data.image
      const name = data.name
      const filter = { _id: new ObjectId(id) }
      let updatedData = { $set: {} }
      if (role) {
        updatedData.$set.role = role;
      }
      if (image) {
        updatedData.$set.image = image;
      }
      if (name) {
        updatedData.$set.name = name;
      }
      const result = await userCollection.updateOne(filter, updatedData)
      res.send(result);
    })

    app.delete('/users/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) }
      const result = await userCollection.deleteOne(filter)
      res.send(result);
    })


    //contest related api
    app.get('/contests', async (req, res) => {
      const searchKey = req.query.tags;
      let query = {};
      if (searchKey) {
        if (searchKey !== 'all') {
          query.contest_type = new RegExp(searchKey.split("-").join(" "), 'i');
        }
      }
      const result = await contestCollection.find(query).toArray();
      res.send(result)
    })

    app.get('/all-contests', async (req, res) => {
      const reqEmail = req.query.email;
      let query = {};
      if (reqEmail) {
        query['contest_creator.email'] = reqEmail;
      }
      const result = await contestCollection.find(query).toArray();
      res.send(result)
    })


    app.get('/contests/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await contestCollection.findOne(query)
      res.send(result)
    })


    app.get('/popular-contests', async (req, res) => {
      const result = await contestCollection.find().limit(6).sort("participate_count", 'desc').toArray();
      res.send(result)
    })

    app.post('/contests', async (req, res) => {
      const contestData = req.body;
      const result = await contestCollection.insertOne(contestData);
      res.send(result)
    })

    app.get('/is-participated/:email', async (req, res) => {
      const email = req.params.email;
      const contestID = req.query.contestID;
      const sortBy = req.query.sortBy;
      const sortMethod = {};
      if (sortBy) {
        sortMethod.contest_deadline = 1
      }
      const query = { ["participator.email"]: email };
      if (contestID) {
        query.contest_id = contestID
      }
      const isParticipated = await participateCollection.find(query).sort(sortMethod).toArray()
      res.send(isParticipated)
    })

    app.post('/participate-contest', async (req, res) => {
      const participateData = req.body;
      const result = await participateCollection.insertOne(participateData);
      res.send(result);
    })


    //payment intent
    app.post('/create-payment-intent', async (req, res) => {
      const { price } = req.body;
      const orderAmout = price * 100;
      if (orderAmout < 1) {
        return res.send({ clientSecret: "" })
      }
      const paymentIntent = await stripe.paymentIntents.create({
        amount: orderAmout,
        currency: "usd",
        payment_method_types: ["card"]
      })
      res.send({ clientSecret: paymentIntent.client_secret })
    })






    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('Contestify Server is running.....')
})

app.listen(port, () => {
  console.log(`Contesitfy server is running on port: ${port}`);
})