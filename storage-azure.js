var fs=require('fs'),
    util = require("util"),
    path = require("path"),
    EventEmitter = require("events").EventEmitter,
    logger=require('vzlogger'),
	azure=require('azure');

var Storage=function(args){
	EventEmitter.call(this);
    var self=this;
    var _existsSync = fs.existsSync || path.existsSync;

    var task={};
    var d=args.security;            
    var config={
        id:d.ID,
        containerName:d.Root,
        rootUri:d.HttpBaseUrl,
        accountName:d.UserName,
        accountKey:d.Password
    }

    var _blob=azure.createBlobService(config.accountName,config.accountKey);


    var _webSafe=function(t){
        if(!t) return "";
        return t.toLowerCase().match(/[a-z0-9\/]+/g).join('');
    }
    var _init=function(remote,local){
        task.dir=path.dirname(local);
        if (!fs.existsSync(task.dir)) {fs.mkdirSync(task.dir);}
        
        var folders=path.dirname(remote).split('/').splice(1);
        
        task.name = path.basename(remote);
        task.root = _webSafe(folders[0]);//
        
        var tmp=_webSafe(folders.splice(1).join('/'));
        task.slug = tmp+(tmp=='/'?'':'/')+_webSafe(task.name);

        task.url = config.rootUri+task.root+'/'+task.slug;
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

    var _upload=function(remote,local){
        if(_validateUploadFile(remote,local)){
            self.emit('debug','azure validated');
            _blob.createContainerIfNotExists(task.root, {publicAccessLevel : task.root=='private' ? null:'blob'},function(err){
                if(!!err) return self.emit('error',{error:err});
                self.emit('debug','azure created');
                _blob.createBlockBlobFromFile(task.root,task.slug,local,function(err1){
                    if(!err) return self.emit('uploaded',task.url);
                    else return self.emit('error',{error:err});
                });
            });
        }
    }

    var _download=function(remote,local){
        if(_validateLocalFile(remote,local)){
            logger.info('downloading',task.name);
            _blob.getBlobToFile(task.root, task.slug,local,function(err){
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
