var _storageFactory=function(d){
    var _supported=['amazon','azure','ftp'];
    if(!d){ return function(){ throw new Error('no storage record found');};}
    if(!d.Provider){ return function(){ throw new Error('no storage provider sepcified, e.g Amazon, Azure, Ftp');};}
    if(_supported.indexOf(d.Provider.toLowerCase())==-1){return function(){ throw new Error('storage provider not supported, expected Amazon, Azure or Ftp.');};}
    return require('./storage-'+d.Provider.toLowerCase());
}

_storageFactory.azure=function(){ return require('./storage-azure');}
_storageFactory.ftp=function(){ return require('./storage-ftp');}
_storageFactory.amazon=function(){ return require('./storage-amazon');}

exports = module.exports = _storageFactory;