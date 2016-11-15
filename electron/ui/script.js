var {ipcRenderer} = require('electron');
var stream = require('stream');
var readline = require('readline');
var lib = require('./../../lib/index');
var fs = require('fs');
var path = require('path');
var terminal, cliPort;

var cliInStream = new stream.Readable({
    read(size) {}
});
var cliOutStream = new stream.Writable({
    write(chunk, encoding, callback) {
        terminal.echo(chunk.toString('utf8'), {keepWords: true});
        callback();
    }
});

var rl = readline.createInterface({
    input: cliInStream,
    output: cliOutStream,
    prompt: ''
});

var logData = {launcher: ''};


function connectCli() {
    lib.cli('localhost', cliPort, rl)
        .then(() => {
            terminal.resume();
        })
        .catch(error => {
            console.error(error);
            setTimeout(connectCli, 1000)
        });
}

function navClick() {
    var m = this.id.match(/nav-(.*)$/);
    $('.panel').hide();
    $('.panel .log').remove();
    $('#panel-'+m[1]).show();
    $('#sidepanel a').removeClass('active');
    $(this).addClass('active');
    $('#panel-'+m[1]+' .log').each(function() { this.scrollTop = this.scrollHeight});
    if(m[1] == 'cli') {
        terminal.resize();
    }
    else {
        var textarea = document.createElement('textarea');
        textarea.className = 'log';
        textarea.setAttribute('readonly', 'readonly');
        textarea.value = logData[m[1]];
        $('#panel-' + m[1]).append(textarea);
    }
}

function readGrowingFile(filename) {
    var out = new stream.Readable({
        read(size) {}
    });

    var bite_size = 256,
        readbytes = 0,
        file;

    fs.open(filename, 'r', function(err, fd) { file = fd; readsome(); });

    function readsome() {
        var stats = fs.fstatSync(file);
        if(stats.size < readbytes+1) {
            setTimeout(readsome, 1000);
        }
        else {
            fs.read(file, new Buffer(bite_size), 0, bite_size, readbytes, processsome);
        }
    }

    function processsome(err, bytecount, buff) {
        out.push(buff.toString('utf-8', 0, bytecount));
        readbytes += bytecount;
        process.nextTick(readsome);
    }

    return out;
}

jQuery(function($, undefined) {

    $('#panel-launcher').show();

    $('#sidepanel a').click(navClick);


    terminal = $('#term').terminal(function (command, term) {
        cliInStream.push(command + "\n");
    }, {
        greetings: '',
        name: 'js_demo',
        prompt: '> ',
        enabled: false
    });
    terminal.pause();

    ipcRenderer.send('ready');
});

ipcRenderer.on('started', (event, data) => {
    cliPort = data.cliPort;
    connectCli();

    var dir = fs.readdirSync(data.logdir);
    dir.forEach(file => {
        var m = file.match(/^(.*)\.log$/);
        if(!m) {
            return;
        }

        var a = document.createElement('a');
        a.id = 'nav-'+m[1];
        a.innerHTML = m[1];
        a.onclick = navClick;

        $('#subnav-processes').append(a);

        var div = document.createElement('div');
        div.id = 'panel-'+m[1];
        div.className = 'panel';
        $('#panels').append(div);

        var fullFilename = path.resolve(data.logdir, file);

        logData[m[1]] = '';

        var stream = readGrowingFile(fullFilename);
        stream.on('data', data => {
            logData[m[1]] += data;
            $('#panel-'+m[1]+' textarea').each(function() {
                this.value += data;
                if (this.scrollTop > this.scrollHeight - $(this).height() - 100) {
                    this.scrollTop = this.scrollHeight;
                }
            });
        });
    })
});

ipcRenderer.on('launcherOutput', (event, data) => {
    logData.launcher += data;
    var textarea = $('#panel-launcher .log')[0];
    if(textarea) {
        textarea.value += data;
        if (textarea.scrollTop > textarea.scrollHeight - $(textarea).height() - 100) {
            textarea.scrollTop = textarea.scrollHeight;
        }
    }
});