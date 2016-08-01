var fs=require('fs'),
    util = require("util"),
    URL=require('url'),
    path = require("path"),
    EventEmitter = require("events").EventEmitter,
    AWS = require('aws-sdk'),
    s3 = require('s3');

var Storage=function(args){
    EventEmitter.call(this);
    var self=this;
    var _existsSync = fs.existsSync || path.existsSync;

    var task={};
    var d=args.security;            
    var config={
        rootUri:d.HttpBaseUrl,
        region:d.Path,
        accessKeyId:d.UserName,
        secretAccessKey:d.Password
    }

    var _webSafe=function(t){
        if(!t) return "";
        return t.toLowerCase().match(/[a-z0-9\.\/-]+/g).join('');
    }

    var _join=function(){
        return path.join.apply(this,arguments).split('\\').join('/');
    }

    var _init=function(remote,local){

        if(remote[0]!='/')  remote='/'+remote;

        task.dir=path.dirname(local);
        if (!fs.existsSync(task.dir)) {fs.mkdirSync(task.dir);}
        
        var folders=path.dirname(remote).split('/').splice(1);
        
        task.ext = path.extname(remote);
        task.name = path.basename(remote,task.ext);
        task.root = _webSafe(folders[0]);//
        
        var tmp=_webSafe(folders.splice(1).join('/'));

        task.slug = _join(tmp,_webSafe(task.name)+task.ext);
        task.path = _join(task.root,task.slug);
        task.url = config.rootUri+task.path;

        self.emit('debug',task);
        return local;
    }

    var _validateLocalFile=function(remote,local){
        return !_existsSync(_init(remote,local));
    }

    var _validateUploadFile=function(remote,local){
        _init(remote,local);
        if (!fs.existsSync(local)) { self.emit('error','file to be uploaded doesn\'t exist '+local);return false;}
        return true;
    }

    var  _buildClient=function(){
        var awsS3Client = new AWS.S3({
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
            region: config.region
        });
        return  s3.createClient({
            s3Client: awsS3Client,
            maxAsyncS3: 20,     // this is the default
            s3RetryCount: 1,    // this is the default
            s3RetryDelay: 1000, // this is the default
            multipartUploadThreshold: 20971520, // this is the default (20 MB)
            multipartUploadSize: 15728640 // this is the default (15 MB)
        });
    }

    var _upload=function(remote,local,privte){

        if(!_validateUploadFile(remote,local)) return;

        self.emit('debug','amazon validated');
        var isPrivte=task.root=='private' || !!privte;
        var isVideo=task.slug.indexOf('.mp4')==task.slug.length;
        var _completed=false;
        var params={
            localFile:local,
            s3Params:{
                ACL:isPrivte?'private':'public-read',
                Key:remote,
                Bucket:d.Root
            }
        };
        self.emit('debug',params);
        var uploader=_buildClient().uploadFile(params);
        uploader.on('error',function(err){
            self.emit('error',err);
        });
        uploader.on('progress', function() {
            var prg=100*uploader.progressAmount/uploader.progressTotal;
            self.emit('progress',{
                status:'uploading',
                size: uploader.progressAmount,
                total:uploader.progressTotal,
                progress:prg
            });
            if(prg>=100 && !_completed){
                _completed=true;
                self.emit('uploaded',task);
            }
        });
        uploader.on('end', function() {
           if(!_completed){
                _completed=true;
                self.emit('uploaded',task);
            }
        });
    }

    var _getFileInfo=function(uri,cb){
        var names=URL.parse(uri).pathname.split('/');
        var container=names[0];
        var blobName=names.splice(1,names.length).join('/');
        _blob.getBlobProperties(container, blobName, function (error, result, response) {
          cb(error, result);
        })
    }

    var _download=function(remote,local,tried){
        tried=tried||0;
        if(_validateLocalFile(remote,local)){
            self.emit('debug','amazon validated');
            var params={
                localFile:local,
                s3Params:{
                    Key:task.slug,
                    Bucket:d.Root
                }
            };
            self.emit('debug',params);
            var _completed=false;
            var downloader=_buildClient().downloadFile(params);
            downloader.on('error',function(err){
                self.emit('error',err);
            });
            downloader.on('progress', function() {
                var prg=100*downloader.progressAmount/downloader.progressTotal;
                self.emit('progress',{
                    status:'downloading',
                    size: downloader.progressAmount,
                    total:downloader.progressTotal,
                    progress:prg
                });
                if(prg>=100 && !_completed){
                    _completed=true;
                    self.emit('downloaded',task);
                }
            });
            downloader.on('end', function() {
                if(!_completed){
                    _completed=true;
                    self.emit('downloaded',task);
                }
            });
        }else{
            self.emit('downloaded',task);
        }
    }

    var _endsWith=function(s,e){
        return s.indexOf(suffix, s.length - s.length) !== -1;
    }

    var names=['cero','uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve','diez','once'];
    function monthName(){
        return names[new Date().getMonth()]+(1900+new Date().getYear()).toString(16);
    }

    Storage.prototype.currentTask=function(){ return task;}
    Storage.prototype.upload = _upload;
    Storage.prototype.download = _download;
    Storage.prototype.hasFile=_getFileInfo;
    
    Storage.prototype.toRemote = function(name,md){
       return _join(md||'/zo'+monthName(),config.root||'',_webSafe(path.basename(name,path.extname(name))),_webSafe(name));
    }

    Storage.prototype.toUrl = function(remote,local){
        _init(remote,local)
        return task.url;
    }

}
util.inherits(Storage, EventEmitter);
exports = module.exports = function(args) {
  return new Storage(args);
};
