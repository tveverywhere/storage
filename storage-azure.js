var fs=require('fs'),
    util = require("util"),
    URL=require('url'),
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

    var _upload=function(remote,local,privte){

        if(!_validateUploadFile(remote,local)) return;
        self.emit('debug','azure validated');
        var isPrivte=task.root=='private' || !!privte;
        var isVideo=task.slug.indexOf('.mp4')==task.slug.length;

        _blob.createContainerIfNotExists(task.root, {publicAccessLevel :  isPrivte ? null:'blob'},function(err){
            if(!!err) return self.emit('error',err);
            self.emit('debug','azure created');
            var azserver=_blob.createBlockBlobFromFile(task.root,task.slug,local, {timeout:33*60*1000}, function(err1){

                clearInterval(pcheck);
                if(!!err1){
                    err1.url=task.url;
                    if(err1.code=='LeaseIdMissing' && !isPrivte){
                        self.emit('debug',{warning:err1});
                        _blob.deleteContainer(task.root,function(deleteError, deleteResponse){
                            self.emit('debug',{warning:deleteError,response:deleteResponse});
                            if(!!deleteError){
                                return self.emit('error',deleteError);
                            }else{
                                setTimeout(_upload,60000,remote,local,privte);
                            }
                        });
                        return;
                    }else{
                        return self.emit('error',err1);
                    }
                }
                
                if(isPrivte || !isVideo) return self.emit('uploaded',task);  

                _blob.acquireLease(task.root,task.slug,{ accessConditions: { 'if-modified-since': new Date().toUTCString()} },
                function(err2, lease, response){
                    if(!!err2){
                        err2.url=task.url;
                        return self.emit('error',err2);
                    }
                    task.lease=lease;
                    self.emit('debug',{lease:lease,response:response});
                    return self.emit('uploaded',task);  
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
            var azserver=_blob.getBlobToFile(task.root, task.slug,local,{timeout:33*60*1000},function(err){
                clearInterval(pcheck);
                if(!err) return self.emit('downloaded',task.url);
                else{ 
                    if(err.message.indexOf('getaddrinfo')>-1 || err.message.indexOf('ECONNRESET')>-1 || err.message.indexOf('ECONN')>-1){
                        _download(remote,local,++tried);
                    }else{
                        return self.emit('error',{error:err,message:'download failed from cdn.'});
                    }
                }
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


    var names=['cero','uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve','diez','once'];
    function monthName(){
        return names[new Date().getMonth()]+(1900+new Date().getYear()).toString(16);
    }

    Storage.prototype.currentTask=function(){ return task;}
    Storage.prototype.upload = _upload;
    Storage.prototype.download = _download;
    Storage.prototype.fixAcl=_checkAcl;
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
