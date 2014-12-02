var _storageFactory=function(d){
    if(!d){ return function(){ throw new Error('no storage record found');};}
    return d.Path.indexOf('windows.net')>-1 ? require('./storage-azure') : require('./storage-ftp');
}

_storageFactory.azure=function(){ return require('./storage-azure');}
_storageFactory.ftp=function(){ return require('./storage-ftp');}

exports = module.exports = _storageFactory;