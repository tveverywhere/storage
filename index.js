var _storageFactory=function(d){
    if(!d){ return function(){ throw new Error('no storage record found');};}
    if(d.Path.indexOf('windows.net')>-1) return require('./storage-azure');
    else return require('./storage-ftp');
    var uknown=function(){
    	console.error('Unkown Provider',d.Path);
    	return null;
    };
    return uknown;
}

_storageFactory.azure=function(){ return require('./storage-azure');}
_storageFactory.ftp=function(){ return require('./storage-ftp');}

exports = module.exports = _storageFactory;