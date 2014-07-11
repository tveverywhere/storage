var fs=require('fs'),
    util = require("util"),
    path = require("path"),
    EventEmitter = require("events").EventEmitter,
    logger=require('vzlogger'),
    JSFtp=require('jsftp');

var Storage=function(args){
	EventEmitter.call(this);
    var self=this;
    var _existsSync = fs.existsSync || path.existsSync;

    var task={};
    var d=args.security;
    var config={
        id:d.ID,
        host:d.Path,
        rootUri:d.HttpBaseUrl,
        root:d.Root,
        username:d.UserName,
        password:d.Password
    }

    var _loadFTP=function(){
        return new JSFtp({host: config.host,port: config.port || 21,user: config.username,pass: config.password});
    }

    var _init=function(remote,local){
        task.dir=path.dirname(local);
        if (!fs.existsSync(task.dir)) {fs.mkdirSync(task.dir);}
        task.name=path.basename(local);
        task.url=config.rootUri+remote;
        return local;
    }

    var _validateLocalFile=function(remote,local){
        return !_existsSync(_init(remote,local));
    }

    var _validateUploadFile=function(remote,local){
        if (!fs.existsSync(local)) { self.emit('error','file to be uploaded doesn\'t exist '+local);return false;}
        _init(remote,local);
        return true;
    }

    var _fixRemote=function(remote){
        if(remote.indexOf(config.root)==-1 && remote.indexOf('/published')==-1) remote=config.root+remote;
        if(remote.indexOf('/published')==-1) remote='/published'+remote;
        return remote;
    }

    var _makeDir=function(ftp,dir,next){
        var total=dir.split('/').length;
        var _doDir=function(i){
            if(i<total){
                var d=dir.split('/').splice(0,i+1).join('/');
                ftp.raw.mkd(d, function(err, data) {
                    _doDir(++i);//ignore errors.
                });
            }else next();
        }
        _doDir(2);
    }

    var _upload=function(remote,local){
        if(_validateUploadFile(remote,local)){
            logger.info('uploading',task.name);
            var ftp=_loadFTP();
            remote=_fixRemote(remote);
            _makeDir(ftp,path.dirname(remote),function(){
               ftp.put(local,remote, function(err) {
                    ftp.raw.quit();
                    logger.info('uploaded',task.name,err||'');
                    if(!err) return self.emit('uploaded',task.url);
                    else return self.emit('error',{error:err});
                });
            });
        }
    }

    var _download=function(remote,local){
        if(_validateLocalFile(remote,local)){
            logger.info('downloading',task.name);
            var ftp=_loadFTP();
            remote=_fixRemote(remote);
            ftp.get(remote, local, function(err) {
                ftp.raw.quit();
                logger.info('downloaded',task.name,err||'');
                if(!err) return self.emit('downloaded',task.url);
                else return self.emit('error',{error:err});
            });
        }else{
            logger.info('download-ignored',task.name);
            self.emit('downloaded',task.url);
        }
    }

    Storage.prototype.upload = _upload; 
    Storage.prototype.download = _download; 

}
util.inherits(Storage, EventEmitter);
exports = module.exports = function(args) {
  return new Storage(args);
};
