var multer=require('multer');
var express= require('express');
var https = require('https');
var http = require('http');


var app = express();
var server = require('http').Server(app);
var io = require('socket.io').listen(server);

server.listen(3000);

app.get('/', function (req, res) {
  res.sendFile(__dirname + '/index.html');
});

app.use(express.static(__dirname + '/'));

app.get('/upload',function(req,res)
    {res.send("hello");})

app.use(multer({ dest: './uploads/',
 rename: function (fieldname, filename) {
    return filename+Date.now();
  },
onFileUploadStart: function (file) {
  console.log(file.originalname + ' is starting ...')
},
onFileUploadComplete: function (file) {
  console.log(file.fieldname + ' uploaded to  ' + file.path)
  done=true;
}
}));

app.post('/upload',function(req,res){
  if(done==true){
    console.log(req.files);
    res.end("File uploaded.");
  }
});

io.sockets.on('connection', function(socket) {


    socket.on('message', function(message) {
        socket.broadcast.emit('message', message);
    });

   socket.on('chat', function(message) {
        socket.broadcast.emit('chat', message);
    });

    socket.on('create or join', function(room) {
        var numClients = io.sockets.clients(room).length;

        if (numClients === 0) {
            socket.join(room);
            socket.emit('created', room);
        } else if (numClients == 1) {

            io.sockets. in (room).emit('join', room);
            socket.join(room);
            socket.emit('joined', room);
        } else {
            socket.emit('full', room);
        }
        socket.emit('emit(): client ' + socket.id + ' joined room ' + room);
        socket.broadcast.emit('broadcast(): client ' + socket.id + ' joined room ' + room);

    });

});
