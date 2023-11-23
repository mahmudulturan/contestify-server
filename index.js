const express = require('express');
const app = express();
const cors = require('cors');
const port = process.env.port || 5000

//middlewares
app.use(cors())
app.use(express.json())


app.get('/', (req, res)=>{
    res.send('Contestify Server is running.....')
})

app.listen(port, ()=> {
    console.log(`Contesitfy server is running on port: ${port}`);
})