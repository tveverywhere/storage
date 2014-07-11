var _storageFactory=function(d){
    if(!d){ return function(){ throw new Error('no storage record found');};}
    if(d.Path.indexOf('level3.net')>-1) return require('./storage-ftp');
    if(d.Path.indexOf('windows.net')>-1) return require('./storage-azure');
}
exports = module.exports = function(args) {
  return _storageFactory(args);
};
