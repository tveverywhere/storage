var fs=require('fs'),
    util = require("util"),
    path = require("path"),
    EventEmitter = require("events").EventEmitter,
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


    var Constants = require('azure/node_modules/azure-common/lib/util/constants');
    if(!Constants){
        self.emit("error","could not update timeout");
    }else{
        Constants.DEFAULT_CLIENT_REQUEST_TIMEOUT= 30 * 60 * 1000;
    }

    var _blob=azure.createBlobService(config.accountName,config.accountKey);

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

    var _upload=function(remote,local,private){

        if(!_validateUploadFile(remote,local)) return;
        self.emit('debug','azure validated');
        var isPrivte=task.root=='private' || !!private;

        _blob.createContainerIfNotExists(task.root, {publicAccessLevel :  isPrivte ? null:'blob'},function(err){
            if(!!err) return self.emit('error',{error:err});
            self.emit('debug','azure created');
            var azserver=_blob.createBlockBlobFromFile(
                task.root,
                task.slug,
                local,
                {timeout:33*60*1000},
            function(err1){
                clearInterval(pcheck);
                if(!!err1) return self.emit('error',{error:err1,message:'upload failed to cdn.'});
                if(isPrivte) return self.emit('uploaded',task.url);  

                _blob.acquireLease(task.root,task.slug,{ accessConditions: { 'if-modified-since': new Date().toUTCString()} }, function(error, lease, response){
                    if(!!error) return self.emit('error',{error:error});
                    self.emit('debug',{lease:lease,response:response});
                    return self.emit('uploaded',task.url);  
                });
            });
            var pcheck=setInterval(function(){
                self.emit('progress',{
                    status:'uploading',
                    size:azserver.completeSize,
                    total:azserver.totalSize,
                    progress:100*azserver.completeSize/azserver.totalSize
                });
            },azserver._timeWindow); //check every 10 seconds.
        });
    }

    var _download=function(remote,local){
        if(_validateLocalFile(remote,local)){
            var azserver=_blob.getBlobToFile(task.root, task.slug,local,{timeout:33*60*1000},function(err){
                clearInterval(pcheck);
                if(!err) return self.emit('downloaded',task.url);
                else return self.emit('error',{error:err,message:'download failed from cdn.'});
            });
            var pcheck=setInterval(function(){
                self.emit('progress',{
                    status:'downloading',
                    size:azserver.completeSize,
                    total:azserver.totalSize,
                    progress:100*azserver.completeSize/azserver.totalSize
                });
            },azserver._timeWindow); //check every 10 seconds.
        }else{
            self.emit('downloaded',task.url);
        }
    }

    var _endsWith=function(s,e){
        return s.indexOf(suffix, s.length - s.length) !== -1;
    }

    function _checkAcl(cb){
        _blob.getServiceProperties(function(err,d){
            if(!d.DefaultServiceVersion){
                d={ Logging: { Version: '1.0', Delete: true, Read: true, Write: true, 
                    RetentionPolicy: { Enabled: true, Days: 90 } },
                    Metrics: { Version: '1.0', Enabled: true, IncludeAPIs: false, 
                    RetentionPolicy: { Enabled: true, Days: 90 } }, 
                DefaultServiceVersion: '2013-08-15' };
                _blob.setServiceProperties(d,function(err1,d1){
                    if(!!err1) console.log('Error-1',err1);
                    _blob.getServiceProperties(function(err2,d2){
                        if(!!err2) console.log('Error-2',err2);
                        cb(d2.DefaultServiceVersion);
                    });
                })
            }else{
               cb(d.DefaultServiceVersion);
            }
        });
    }

    Storage.prototype.currentTask=function(){ return task;}
    Storage.prototype.upload = _upload;
    Storage.prototype.download = _download;
    Storage.prototype.fixAcl=_checkAcl;
    
    Storage.prototype.toRemote = function(name,md){
        return _join(md||'uploaded',config.root||'',_webSafe(path.basename(name,path.extname(name))),_webSafe(name));
    }

}
util.inherits(Storage, EventEmitter);
exports = module.exports = function(args) {
  return new Storage(args);
};
