var _storageFactory=function(d){
    var _supported=['amazon','azure','ftp'];
    if(!d){ return function(){ throw new Error('no storage record found');};}
    if(!d.Provider || _supported.indexOf(d.Provider.toLowerCase())==-1){ return require('./storage-azure');}
    //if(){return function(){ throw new Error('storage provider not supported, expected Amazon, Azure or Ftp.');};}
    return require('./storage-'+d.Provider.toLowerCase());
}

_storageFactory.azure=function(){ return require('./storage-azure');}
_storageFactory.ftp=function(){ return require('./storage-ftp');}
_storageFactory.amazon=function(){ return require('./storage-amazon');}

exports = module.exports = _storageFactory;