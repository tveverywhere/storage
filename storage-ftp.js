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


    var _endsWith=function(s,e){
        return s.indexOf(e, s.length - s.length) !== -1;
    }

    var _parseHttpUri=function(k,root){
        if(k.indexOf('http')==0) return k;
        k='http://'+k;
        if(!_endsWith(k,root)) k+=root;
        if(!_endsWith(k,'/')) k+='/';
        return k;
    }

    var _loadFTP=function(){
        return new JSFtp({host: config.host,port: config.port || 21,user: config.username,pass: config.password});
    }

    var _webSafe=function(t){
        if(!t) return "";
        return t.toLowerCase().match(/[a-z0-9\.\/-]+/g).join('');
    }

    var _join=function(){
        return path.join.apply(this,arguments).split('\\').join('/');
    }

    var _init=function(remote,local){
        
        if(remote[0]!='/') remote='/'+remote;

        var folders= path.dirname(remote).split('/');
        task.ext = path.extname(remote);
        task.name = path.basename(remote,task.ext);
        task.root = _webSafe(folders[0]);//
        
        var tmp=_webSafe(folders.splice(1).join('/'));

        task.slug =  '/'+_join(tmp,_webSafe(task.name)+task.ext).replace('published/','');
        task.path = _fixRemote(_join(task.root,task.slug));
        task.url = config.rootUri+task.slug.substring(1);

        self.emit('debug',task);
        //throw ex;
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
        if(remote.indexOf(config.root)==-1 && remote.indexOf('/published')==-1 && remote.indexOf('published')!=0) remote=config.root+remote;
        if(remote.indexOf('/published')==-1 && remote.indexOf('published')!=0) remote='/published'+remote;
        if(remote[0]!='/') remote='/'+remote;
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

    var _reemit=function(event) {
      return function(data) {
        self.emit(event, data);
      }
    };

    var _upload=function(remote,local){
        if(_validateUploadFile(remote,local)){
            logger.info('uploading',task.name);
            var lastProgress=0;
            var ftp=_loadFTP()
                .on('error',_reemit('error'))
                .on('progress',function(p){
                    var prg=(100*p.transferred/p.total)||0;
                    if(prg!=lastProgress){
                        lastProgres=prg;
                        self.emit('progress',{
                            status:'uploading',
                            size:p.transferred,
                            total:p.total,
                            progress:prg
                        });
                    }
                });
            _makeDir(ftp,path.dirname(task.path),function(){
               logger.info('dir-created',task.path);
               fs.stat(local, function(err, stats) {
                   var read = fs.createReadStream(local, {
                      bufferSize: 2 * 1024 * 1024
                   });
                   read.size = err ? 0 : stats.size;
                   ftp.put(read,task.path, function(err) {
                        ftp.raw.quit();
                        logger.info('uploaded',task.name,err||'');
                        if(!err) return self.emit('uploaded',task.url);
                        else return self.emit('error',{error:err});
                    });
                })
            });
        }
    }

    var _download=function(remote,local){
        if(_validateLocalFile(remote,local)){
            logger.info('downloading',task.name);
            var ftp=_loadFTP()
                .on('progress',function(p){
                    self.emit('progress',{
                        status:'downloading',
                        size:p.transferred,
                        total:p.total,
                        progress:100*p.transferred/p.total
                    });
                });
            remote=_fixRemote(remote);
            ftp.get(remote, local, function(err) {
                ftp.raw.quit();
                logger.info('on-downloaded',task.name,err||'');
                if(!err) return self.emit('downloaded',task.url);
                else return self.emit('error',{error:err});
            });
        }else{
            logger.info('download-ignored',task.name);
            self.emit('downloaded',task.url);
        }
    }

    Storage.prototype.currentTask=function(){ return task;}
    Storage.prototype.upload = _upload; 
    Storage.prototype.download = _download; 
    Storage.prototype.toRemote = function(name,md){
        return '/'+_join('published',config.root,_webSafe(path.basename(name,path.extname(name))),_webSafe(name));
    }

    config.rootUri=_parseHttpUri(config.rootUri,config.root);
}
util.inherits(Storage, EventEmitter);
exports = module.exports = function(args) {
  return new Storage(args);
};
