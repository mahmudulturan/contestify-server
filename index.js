const express = require('express');
require("dotenv").config()
const app = express();
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY)
const jwt = require("jsonwebtoken");
const cookieParser = require('cookie-parser')
const port = process.env.port || 5000

//middlewares
app.use(cors({
  origin: [
    // "http://localhost:5173",
    "https://thecontestify.firebaseapp.com",
    "https://thecontestify.web.app"
  ],
  credentials: true
}))
app.use(express.json())
app.use(cookieParser())


//custom middlewares
const verifyToken = async (req, res, next) => {
  const token = req.cookies?.token
  if (!token) {
    return res.status(401).send({ message: "unauthorized access" })
  }
  jwt.verify(token, process.env.TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).send({ message: "unauthorized access" })
    }
    req.user = decoded
    next()
  })
}




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


    //get token
    app.post('/jwt', async (req, res) => {
      const email = req.body;
      const token = jwt.sign(email, process.env.TOKEN_SECRET, { expiresIn: "1h" })
      res.cookie("token", token, { httpOnly: true, secure: true, sameSite: 'none' }).send({ success: true })
    })

    //clear token
    app.delete('/clear-cookie', async (req, res) => {
      res.clearCookie('token', { maxAge: 0, httpOnly: true, secure: true, sameSite: 'none'  }).send({ message: 'success' })
    })


    //users related api

    //endpoint for get all users
    app.get('/users', verifyToken, async (req, res) => {
      const result = await userCollection.find().toArray()
      res.send(result)
    })

    //endpoint for get single users
    app.get('/users/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (req?.user?.email !== email) {
        return res.status(403).send({ message: "unauthorized access" })
      }
      const query = { email: email }
      const result = await userCollection.findOne(query)
      res.send(result)
    })

    //endpoint for get all winners and single winners
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

    //endpoint for get user stats
    app.get('/user-stats/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (req?.user?.email !== email) {
        return res.status(403).send({ message: "unauthorized access" })
      }
      const contestQuery = { ['winner.email']: email }
      const participantQuery = { ['participator.email']: email }
      const winningResult = await contestCollection.find(contestQuery).toArray()
      const participantResult = await participateCollection.find(participantQuery).toArray()
      const winningCount = winningResult.length;
      const participantCount = participantResult.length;
      const winningPercentage = ((winningCount / participantCount) * 100).toFixed(2)
      res.send({ winningCount, participantCount, winningPercentage })
    })



    //endpoint for insert or get exist message
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


    //endpoint for change user's role
    app.patch('/change-role/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) }
      const role = req.body.role
      let updatedData = {
        $set: {
          role: role
        }
      }
      const result = await userCollection.updateOne(filter, updatedData)
      res.send(result);
    })

    //endpoint for change users name and image
    app.patch('/users/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (req?.user?.email !== email) {
        return res.status(403).send({ message: "unauthorized access" })
      }
      const data = req.body;
      const image = data.image
      const name = data.name
      const filter = { email: email }
      let updatedData = { $set: {} }
      if (image) {
        updatedData.$set.image = image;
      }
      if (name) {
        updatedData.$set.name = name;
      }
      const result = await userCollection.updateOne(filter, updatedData)
      res.send(result);
    })

    //endpoint for delete an user from db
    app.delete('/users/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) }
      const result = await userCollection.deleteOne(filter)
      res.send(result);
    })


    //contest related api

    //endpoint for get all public contests
    app.get('/contests', async (req, res) => {
      const searchKey = req.query.tags;
      let query = { status: "accepted" };
      if (searchKey) {
        if (searchKey !== 'all') {
          query.contest_type = new RegExp(searchKey.split("-").join(" "), 'i');
        }
      }
      query.status = "accepted";
      const result = await contestCollection.find(query).toArray();
      res.send(result)
    })


    //endpoint for get all contests
    app.get('/all-contests', verifyToken, async (req, res) => {
      const result = await contestCollection.find().toArray();
      res.send(result)
    })

    //endpoint for get creators own added contests
    app.get('/my-contests/:email', verifyToken, async (req, res) => {
      const reqEmail = req.params.email;
      if (req?.user?.email !== reqEmail) {
        return res.status(403).send({ message: "unauthorized access" })
      }
      const query = {
        ['contest_creator.email']: reqEmail
      };
      const result = await contestCollection.find(query).toArray();
      res.send(result)
    })

    //endpoint for get single contest data
    app.get('/contests/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await contestCollection.findOne(query)
      res.send(result)
    })


    //endpoint for get popular contests
    app.get('/popular-contests', async (req, res) => {
      const result = await contestCollection.find().limit(6).sort("participate_count", 'desc').toArray();
      res.send(result)
    })

    //endpoint for post a new contest
    app.post('/contests', verifyToken, async (req, res) => {
      const contestData = req.body;
      const result = await contestCollection.insertOne(contestData);
      res.send(result)
    })

    //endpoint for update an contest
    app.put('/contests/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const data = req.body;
      const filter = { _id: new ObjectId(id) };
      const updatedData = {
        $set: {
          name: data.name,
          image: data.image,
          description: data.description,
          contest_price: data.contest_price,
          prize_money: data.prize_money,
          task_submission_instruction: data.task_submission_instruction,
          status: data.status,
          contest_type: data.contest_type,
          contest_deadline: data.contest_deadline,
          participate_count: data.participate_count,
          contest_startDate: data.contest_startDate,
          contest_creator: data.contest_creator
        }
      }
      const options = { upsert: true };
      const result = await contestCollection.updateOne(filter, updatedData, options);
      res.send(result);
    })

    //endpoint for update contest status
    app.patch('/contests/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const data = req.body;
      const status = data.status;
      const filter = { _id: new ObjectId(id) };
      const updatedData = { $set: {} }
      if (status) {
        updatedData.$set.status = status;
      }
      const options = { upsert: true };
      const result = await contestCollection.updateOne(filter, updatedData, options);
      res.send(result);
    })

    //endpoint for select an winner
    app.patch('/select-winner/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const winnerData = req.body;
      const filter = { _id: new ObjectId(id) };
      const updatedData = { $set: { winner: winnerData } }
      const options = { upsert: true };
      const result = await contestCollection.updateOne(filter, updatedData, options);
      res.send(result);
    })

    //endpoint for delete an contest
    app.delete('/contests/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await contestCollection.deleteOne(query)
      res.send(result)
    })

    //endpoint for get users own participated data.
    app.get('/is-participated/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (req?.user?.email !== email) {
        return res.status(403).send({ message: "unauthorized access" })
      }
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


    //endpoint for get total submission for each contest
    app.get('/total-submitted/:id', verifyToken, async (req, res) => {
      const contestID = req.params.id;
      const query = { contest_id: contestID };
      const result = await participateCollection.find(query).toArray()
      res.send(result)
    })

    //endpoint for participate for an contest
    app.post('/participate-contest', verifyToken, async (req, res) => {
      const participateData = req.body;
      const filter = { _id: new ObjectId(participateData.contest_id) }
      const find = await contestCollection.findOne(filter)
      const updatedData = {
        $set: {
          participate_count: find.participate_count + 1
        }
      }
      const result = await participateCollection.insertOne(participateData);
      await contestCollection.updateOne(filter, updatedData)
      res.send(result);
    })

    //endpoint for submit participant task
    app.post('/participate-contest/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) }
      const task = req.body.task;
      const updatedData = {
        $set: {
          submitted_task: task
        }
      }
      const result = await participateCollection.updateOne(filter, updatedData);
      res.send(result);
    })


    //payment intent
    app.post('/create-payment-intent', verifyToken, async (req, res) => {
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