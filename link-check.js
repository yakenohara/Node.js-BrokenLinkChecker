{/* <License>------------------------------------------------------------
 Copyright (c) 2021 Shinnosuke Yakenohara
 This program is free software: you can redistribute it and/or modify
 it under the terms of the GNU General Public License as published by
 the Free Software Foundation, either version 3 of the License, or
 (at your option) any later version.
 This program is distributed in the hope that it will be useful,
 but WITHOUT ANY WARRANTY; without even the implied warranty of
 MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 GNU General Public License for more details.
 You should have received a copy of the GNU General Public License
 along with this program.  If not, see <http://www.gnu.org/licenses/>
-----------------------------------------------------------</License> */}

var https = require('https');
var http = require('http');

// <Tunings>----------------------
// var int_msTimeForTimeOut = 10000; //todo <- original
var int_msTimeForTimeOut = 10000;
// ---------------------</Tunings>

(async function(){

    // <settings>-----------------------------------------------------------------------

    var str_defaultOutFileName = 'Referencing Report.md';
    var rgx_fileNameToProcess = /.+\.md/i;
    var rgx_fileNameLocalImages = [
        /.+\.png/i,
        /.+\.jpg/i,
        /.+\.jpeg/i,
        /.+\.svg/i
    ]
    var str_returnChar = '\n';
    var int_msTimeForWatch = 250;
    var int_retryTimesFor429 = 64;
    

    // ----------------------------------------------------------------------</settings>

    // Require
    var obj_fileSystem = require('fs');
    var obj_path = require('path');
    var https = require('https');
    var http = require('http');

    // https://markdown-it.github.io/markdown-it/
    var obj_mkdnIt = require('markdown-it')();

    var str_usage = 
    `# Usage

    \`\`\`
    ${obj_path.basename(process.argv[1])} directory [outpath]
    \`\`\`

    ## Required argment

    - \`directory\`
    Directory where DOT file(s) that representing call graph is stored.

    ## Options

    - \`outpath\`
    Path to save the analysis result.
    If not specified, the result will be saved in the directory where DOT file(s) is stored.`;

    console.log('[LOG] ' + 'Checking argument(s)...');

    // 入力 dot file path check
    var str_dotFileDir = process.argv[2];

    if(str_dotFileDir === undefined){ // ディレクトリ指定が無い場合
        console.error('[ERR] ' + 'Argument not specified. check the usage.');
        console.log('\n' + str_usage);
        return;
    }

    try{ //パスチェック
        var obj_statOfDotFileDir = obj_fileSystem.statSync(str_dotFileDir);
    }catch(error){
        if (error.code === 'ENOENT') { // no such file or directory
            console.error('[ERR] ' + '"' + str_dotFileDir + '" No such file or directory');
        }else{ // unkown error
            console.error('[ERR] ' + error);
        }
        return;
    }

    if(!obj_statOfDotFileDir.isDirectory()){ // directory ではない場合
        console.error('[ERR] ' + '"' + str_dotFileDir + '" is not Directory.');
        return;
    }

    var str_dotFileDirAbs = obj_path.resolve(str_dotFileDir);
    console.log('[LOG] ' + 'INPUT  : "' + str_dotFileDirAbs + '"');

    // 出力 file path check
    var str_outFilePath = process.argv[3];
    var str_analysisResultFilePath = '';
    var obj_statOfOutFile;
    if(str_outFilePath === undefined){ // 出力先ファイルパス指定がない場合
        str_outFilePath = str_defaultOutFileName;
        str_analysisResultFilePath = str_defaultOutFileName; // 出力先ファイルパス生成

    }else{
        str_analysisResultFilePath = str_outFilePath;
    }

    str_analysisResultFilePath = obj_path.resolve(str_analysisResultFilePath);
    
    try{ //パスチェック
        obj_statOfOutFile = obj_fileSystem.statSync(str_analysisResultFilePath);

        if(obj_statOfOutFile.isFile()){ // ファイルが存在する場合
            obj_fileSystem.unlinkSync(str_analysisResultFilePath); // ファイル削除
        }
        
    }catch(error){
        if (error.code === 'ENOENT') { // no such file or directory
            //nothing to do

        }else{ // unkown error
            console.error('[ERR] ' + error);
            return;
        }
    }

    console.log('[LOG] ' + 'OUTPUT : "' + str_analysisResultFilePath + '"');

    // <making dot file list to parse>--------------------------------------------------

    console.log('[LOG] ' + 'Analyzing...');

    var str_entriesRecurse = func_readdirSyncRecurseFile(str_dotFileDirAbs); // ディレクトリ配下のファイルパスリストを再帰的に取得
    var str_filterd = []; // 処理対象リスト
    var str_imagePaths = []; // 画像 Path リスト
    // 処理対象ファイル数の把握
    for(var int_idxOfFileList = 0 ; int_idxOfFileList < str_entriesRecurse.length ; int_idxOfFileList++){
        var str_path = str_entriesRecurse[int_idxOfFileList];
        if(rgx_fileNameToProcess.test(str_path)){ // 対象ファイルの場合
            str_filterd.push(str_path); // 処理対象リストに追加
        }

        for(var idxOfImgExts = 0 ; idxOfImgExts < rgx_fileNameLocalImages.length ; idxOfImgExts++){ //todo 大文字、小文字を無視する
            if(rgx_fileNameLocalImages[idxOfImgExts].test(str_path)){ // 画像ファイルの場合
                str_imagePaths.push(str_path); // 画像リストに追加
            }
        }
    }

    // 処理対象リストの走査
    var obj_ = null;
    var int_idxOfFilterd = 0;
    var objarr_requests = [];
    var objarr_response = [];
    var objarr_effectiveness = [];
    var int_haveDone = 0;
    var int_429retryingIdx = -1; // `429 too many requests`による retry 中の idx no

    while (int_idxOfFilterd < str_filterd.length){

        if (int_idxOfFilterd == 0){
            // h1 level title
            func_appendWriteLine(`# Referencing Report`);
        }
        
        while(obj_ == null && int_idxOfFilterd < str_filterd.length){

            console.log('[LOG] ' + `( ${int_idxOfFilterd + 1} of ${str_filterd.length} ) ${str_filterd[int_idxOfFilterd]}`);

            // ファイル内テキストの読み込み
            var str_mdContent = obj_fileSystem.readFileSync(str_filterd[int_idxOfFilterd]).toString();
        
            // parse
            obj_tokens = obj_mkdnIt.parse(str_mdContent, {}); // https://markdown-it.github.io/markdown-it/#MarkdownIt.parse

            obj_ = func_list(obj_tokens, {map:null, content:''}, 0);

            // h1 level title
            func_appendWriteLine(``);
            func_appendWriteLine(`## ${str_filterd[int_idxOfFilterd]}`); //todo 相対パス
            
            // number of links
            if(obj_.length == 0){
                func_appendWriteLine(``);
                func_appendWriteLine(`No link found.`);
                obj_ = null;
                objarr_requests = [];

            }else{
                func_appendWriteLine(``);
                func_appendWriteLine(`${obj_.length} link(s) found.`);

                objarr_response = new Array(obj_.length);
                objarr_effectiveness = new Array(obj_.length);
                objarr_requests = new Array(obj_.length);
                int_429retryingIdx = -1;

                for(var int_idx = 0 ; int_idx < obj_.length ; int_idx++){
                    func_try({
                        index:int_idx,
                        retryTimes:0
                    });
                }
            }

            int_idxOfFilterd++;

        }


        function func_try(obj_identifer){
            objarr_requests[obj_identifer['index']] = (new httpsGet(
                obj_[obj_identifer['index']]['attrs'][0][1], // URL
                '', // requested response only.
                obj_identifer, // request ID
                async function(obj_result){ // Got request result

                    objarr_response[obj_result['identifier']['index']] = obj_result;

                    if( 2 <= obj_result['lastStageNumber']){ // Request does lead to 'Got http response'
                        if(obj_result['incomingMsg']['statusCode'] === 200){ // http response code represents `200 OK`
                            objarr_effectiveness[obj_result['identifier']['index']] = func_makeFileExisteceObj(obj_result['url'], true, true);
                            if(0 < obj_result['identifier']['retryTimes']){
                                int_429retryingIdx = -1;
                            }
                            int_haveDone++;

                        }else if(obj_result['incomingMsg']['statusCode'] === 429){ // `429 too many requests`
                            
                            if(obj_identifer['retryTimes'] <= int_retryTimesFor429){

                                await func_sleep(1000); // とりあえず 1s 待つ

                                while (  // `429 too many requests` による retry がなされている間
                                    (-1 < int_429retryingIdx) &&
                                    (int_429retryingIdx != obj_result['identifier']['index'])
                                ){
                                    await func_sleep(1000);

                                }
                                int_429retryingIdx = obj_result['identifier']['index'];
                                func_try({ // retry
                                    index:obj_result['identifier']['index'],
                                    retryTimes:(obj_result['identifier']['retryTimes'] + 1)
                                });

                            }else{
                                objarr_effectiveness[obj_result['identifier']['index']] = func_makeFileExisteceObj(obj_result['url'], false, true);
                                if(0 < obj_result['identifier']['retryTimes']){
                                    int_429retryingIdx = -1;
                                }
                                int_haveDone++;
                            }
                            

                        }else{ // http response code **not** represents either `200 OK` nor `429 too many requests`
                            objarr_effectiveness[obj_result['identifier']['index']] = func_makeFileExisteceObj(obj_result['url'], false, true);
                            if(0 < obj_result['identifier']['retryTimes']){
                                int_429retryingIdx = -1;
                            }
                            int_haveDone++;
                        }

                    }else{ // Request doesn't lead to 'Got http response'

                        var str_decoded = decodeURI(obj_result['url']); // decode percent encoding
                        
                        // 問い合わせ URL を相対パスと解釈してローカルから検索
                        var str_abs = obj_path.resolve(
                            obj_path.dirname(str_filterd[int_idxOfFilterd]),
                            str_decoded
                        );

                        try{
                            var obj_statOfToSearch = obj_fileSystem.statSync(str_analysisResultFilePath);

                            if(obj_statOfToSearch.isFile()){ // ファイルが存在する場合
                                objarr_effectiveness[obj_result['identifier']['index']] = func_makeFileExisteceObj(str_abs, true, false);

                                //画像ファイルの場合は、 画像リストから削除
                                for(var idxOfImgExts = 0 ; idxOfImgExts < rgx_fileNameLocalImages.length ; idxOfImgExts++){
                                    if(rgx_fileNameLocalImages[idxOfImgExts].test(str_abs)){ // 画像ファイルの場合
                                        var int_refIdx = str_imagePaths.indexOf(str_abs);
                                        if(int_refIdx !== (-1)){ // Unreferenced 画像ファイルリストに存在する場合
                                            str_imagePaths.splice(int_refIdx, 1); // Unreferenced 画像ファイルリストから削除
                                        }
                                    }
                                }

                            }else{ // 対象はディレクトリの場合
                                objarr_effectiveness[obj_result['identifier']['index']] = func_makeFileExisteceObj(str_abs, false, false);
                            }

                        }catch(err){
                            if (error.code === 'ENOENT') { // no such file or directory
                                objarr_effectiveness[obj_result['identifier']['index']] = func_makeFileExisteceObj(str_abs, false, false);
                    
                            }else{ // unkown error
                                console.error('[ERR] ' + error);
                                return;
                            }
                        }

                        int_haveDone++;

                    }

                    function func_makeFileExisteceObj(str_dir, bl_existece, bl_isLink){
                        return {
                            path: str_dir,
                            effectiveness: bl_existece,
                            isLink: bl_isLink
                        };
                    }
                }
            ));
        }
        
        while(int_haveDone < objarr_requests.length){ // すべての要求に対する response が帰っていない場合
            await func_sleep(int_msTimeForWatch);

        }

        for(var int_idxOfResponse = 0 ; obj_ != null && int_idxOfResponse < obj_.length ; int_idxOfResponse++){

            var obj_link = obj_[int_idxOfResponse];

            var str_response =
`
 - \`${obj_link['attrs'][0][1]}\`

Effectiveness:${(objarr_effectiveness[int_idxOfResponse]['effectiveness'] ? 'OK' : 'NG')}${(objarr_effectiveness[int_idxOfResponse]['isLink'] ? (' (' + objarr_response[int_idxOfResponse]['incomingMsg']['statusCode'] + ' (' + objarr_response[int_idxOfResponse]['incomingMsg']['statusMessage'] + '))') : '')}  

map ${obj_link['mapLevelInfo']['map'][0]} - ${obj_link['mapLevelInfo']['map'][1]}
\`\`\`
${obj_link['mapLevelInfo']['content']}
\`\`\``;

            func_appendWriteLine(str_response);
        }
        
        obj_ = null;
        objarr_requests = [];
        objarr_response = [];
        int_haveDone = 0;
    }

    func_appendWriteLine(``);
    func_appendWriteLine(`# Unreferenced Images`);
    func_appendWriteLine(``);
    if( 0 === str_imagePaths.length){ // Unreferenced image が存在しない場合
        func_appendWriteLine(`There is not unreferenced image`);
    }else{ // Unreferenced image が存在する場合
        func_appendWriteLine(`${str_imagePaths.length} image(s) is unreferenced.`);
        func_appendWriteLine(``);
        for (var int_idxOfImages = 0 ; int_idxOfImages < str_imagePaths.length ; int_idxOfImages++){
            func_appendWriteLine(` - ${str_imagePaths[int_idxOfImages]}`);
        }

    }


    // -------------------------------------------------</making dot file list to parse>

    function func_appendWriteLine(str_toWrite){
        obj_fileSystem.appendFileSync(str_analysisResultFilePath, `${str_toWrite}${str_returnChar}`);
    }
    
    // <指定ディレクトリ配下のファイル / ディレクトリーリストを作る>-------------------------------------------------------------
    
    //
    // 指定ディレクトリ配下のファイル / ディレクトリーリストを作る
    //
    function func_readdirSyncRecurse(str_dirName){
        
        var str_entriesRecurse = [];
        var str_entries = obj_fileSystem.readdirSync(str_dirName); // ディレクトリ直下のファイル / ディレクトリリストの取得

        for(var str_idxOfEntries = 0 ; str_idxOfEntries < str_entries.length ; str_idxOfEntries++){
            var str_pathOfInterest = obj_path.resolve(str_dirName, str_entries[str_idxOfEntries]); // フルパスの取得
            
            // ディレクトリを再帰的に走査
            if(obj_fileSystem.statSync(str_pathOfInterest).isDirectory()){ // ディレクトリの場合
                var str_childPaths = func_readdirSyncRecurse(str_pathOfInterest);
                str_entriesRecurse = str_childPaths.concat(str_entriesRecurse);
            }

            str_entriesRecurse.push(str_pathOfInterest); // エントリーリストに追加
        }

        return str_entriesRecurse;
    }

    //
    // 指定ディレクトリ配下のファイルリストを作る
    //
    function func_readdirSyncRecurseFile(str_dirName){
        
        var str_entriesRecurse = [];
        var str_entries = obj_fileSystem.readdirSync(str_dirName); // ディレクトリ直下のファイル / ディレクトリリストの取得

        for(var str_idxOfEntries = 0 ; str_idxOfEntries < str_entries.length ; str_idxOfEntries++){
            var str_pathOfInterest = obj_path.resolve(str_dirName, str_entries[str_idxOfEntries]); // フルパスの取得
            
            // ディレクトリを再帰的に走査
            if(obj_fileSystem.statSync(str_pathOfInterest).isDirectory()){ // ディレクトリの場合
                var str_childPaths = func_readdirSyncRecurseFile(str_pathOfInterest);
                str_entriesRecurse = str_childPaths.concat(str_entriesRecurse);
            }

            if(obj_fileSystem.statSync(str_pathOfInterest).isFile()){ // ファイルの場合
                str_entriesRecurse.push(str_pathOfInterest); // エントリーリストに追加
            }
        }

        return str_entriesRecurse;
    }

    //
    // 指定ディレクトリ配下のディレクトリーリストを作る
    //
    function func_readdirSyncRecurseDirectory(str_dirName){
        
        var str_entriesRecurse = [];
        var str_entries = obj_fileSystem.readdirSync(str_dirName); // ディレクトリ直下のファイル / ディレクトリリストの取得

        for(var str_idxOfEntries = 0 ; str_idxOfEntries < str_entries.length ; str_idxOfEntries++){
            var str_pathOfInterest = obj_path.resolve(str_dirName, str_entries[str_idxOfEntries]); // フルパスの取得
            
            // ディレクトリを再帰的に走査
            if(obj_fileSystem.statSync(str_pathOfInterest).isDirectory()){ // ディレクトリの場合
                var str_childPaths = func_readdirSyncRecurseDirectory(str_pathOfInterest);
                str_entriesRecurse = str_childPaths.concat(str_entriesRecurse);
            }

            if(obj_fileSystem.statSync(str_pathOfInterest).isDirectory()){ // ディレクトリーの場合
                str_entriesRecurse.push(str_pathOfInterest); // エントリーリストに追加
            }
        }

        return str_entriesRecurse;
    }

    // ------------------------------------------------------------</指定ディレクトリ配下のファイル / ディレクトリーリストを作る>

    function func_list(obj_tokens, obj_mapLvelInfo, level){ //todo level の削除
        var ret = [];
        if (obj_tokens == null){
            return ret;
        }

        for(var int_idxOfTokens = 0 ; int_idxOfTokens < obj_tokens.length ; int_idxOfTokens++){
            
            var obj_tokenOfInterest = obj_tokens[int_idxOfTokens];
            
            if (obj_tokenOfInterest['map'] != null ){ // `map` property existed
                // update map level info
                obj_mapLvelInfo['map'] = obj_tokenOfInterest['map'];
                obj_mapLvelInfo['content'] = obj_tokenOfInterest['content'];
            }

            if (obj_tokenOfInterest['type'] == 'image'){
                var v = {
                    type : obj_tokenOfInterest['type'],
                    mapLevelInfo : obj_mapLvelInfo,
                    attrs : func_aaa(obj_tokenOfInterest['attrs'], ['src'])
                };
                ret.push(v);

            }else if (obj_tokenOfInterest['type'] == 'link_open'){
                var v = {
                    type : obj_tokenOfInterest['type'],
                    mapLevelInfo : obj_mapLvelInfo,
                    attrs : func_aaa(obj_tokenOfInterest['attrs'], ['href'])
                };
                ret.push(v);
            }

            if (obj_tokenOfInterest['children'] != null ){ // `children` property existed
                // console.log('child');
                var obj_children = func_list(
                    obj_tokenOfInterest['children'],
                    {
                        map:obj_mapLvelInfo['map'],
                        content:obj_mapLvelInfo['content']
                    },
                    level + 1
                );
                ret = ret.concat(obj_children);
            }
        }

        return ret;

        function func_aaa(obj_attrs, str_attr){
            var obj_ret = [];
            
            for(var int_idxOfAttrs = 0 ; int_idxOfAttrs < obj_attrs.length ; int_idxOfAttrs++){
                if(0 <= str_attr.indexOf(obj_attrs[int_idxOfAttrs][0])){
                    obj_ret.push(obj_attrs[int_idxOfAttrs]);
                }
            }

            return obj_ret;
        }
    }

}());

function func_sleep(int_mSec) {
    return new Promise(function(resolve) {
 
       setTimeout(function() {resolve()}, int_mSec);
 
    })
 }

//
//  Access to the specified URL and save as file
//
//  Parameters
//  ----------
//  url : String
//      URL to download
//  fileName : String
//      Filepath to save file. If empty string specified, this function returns requested response only.
//todo id
//  resultListener : function
//      Callback function that will be fired with 1 argument(see following) when process is ended.  
//      Note. This will be fired whether process ends in scceeded or not.
//          1st Argment : Object
//              Each property means following
//                  isOK : boolean
//                      true if all process ends in scceeded, otherwise false
//                  message : String
//                      Overview of all processes
//                  lastStageNumber : Number
//                      Which process number reached in the download processes that is divided into the following 4 processes
//                          1: 'Wait for http response'
//                          2: 'Got http response'
//                          3: 'Waiting for download completion
//                          4: 'Completed'
//                  lastStageMessage : Number
//                      Meaning of lastStageNumber above
//                  incomingMsg : Object
//                      Note. This property will be added only if there is responce from the server
//                      Following property of the http response
//                          statusCode : Number
//                              Status code of the http response. Same as message.statusCode of http.IncomingMessage class. To know details, See following.
//                              https://nodejs.org/api/http.html#http_message_statuscode
//                          statusMessage : String
//                              Status message of the http response. Same as message.statusMessage of http.IncomingMessage class. To know details, See following.
//                              https://nodejs.org/api/http.html#http_message_statusmessage
//                          headers : Object
//                              Response header of the http response. Same as message.headers of http.IncomingMessage class. To know details, See following.
//                              https://nodejs.org/api/http.html#http_message_headers
//                          complete
//                              True if download successfully ended otherwise false. Same as message.complete of http.IncomingMessage class. To know details, See following.
//                              https://nodejs.org/api/http.html#http_message_complete
//                  toDownloadByteSize : Number
//                      Note. This property will be added only if there is a valid 'content-size' property in the http response from the server
//                      Total byte size of content.
//                  downloadedByteSize : Number
//                      Note. This property will be added only if downloading process is started
//                      How many bytes downloaded when process ended
//  stageListener : function
//      Callback function that will be fired with 2 argument(see following) when process stage is moved.  
//          1st Argument : Number
//              Which process number reached in the download processes that is divided into the following 4 processes
//                  1: 'Wait for http response'
//                  2: 'Got http response'
//                  3: 'Waiting for download completion
//                  4: 'Completed'
//          2nd Argument : Number
//              Meaning of 1st argument above
//  dlProgressListener : function
//      Callback function that will be fired with 2 argument(see following) when every 'data' event of download stream.
//          1st Argument : Number
//              Total amount byte size of downloaded completely
//          2nd Argument : Number
//              Content byte size of file
//              Note. This argument will be specified only if there is a valid 'content-size' property in the http response from the server
// 
function httpsGet(url, fileName, identifier, resultListener, stageListener, dlProgressListener){

    var func_forInvokingGetMethod;
    var int_stage = 0;
    var obj_stageDef = {
        '0': 'Generate http request',
        '1': 'Wait for http response',
        '2': 'Got http response',
        '3': 'Waiting for download completion',
        '4': 'Completed'
    }

    var bool_haveDone = false;
    var str_reportedMessage;

    var obj_res;
    var int_toDownloadByteSize;
    var int_downloadedByteSize;

    this.getStatus = function(){

        var str_msg = bool_haveDone ? str_reportedMessage : 'Now in progress' ;

        return func_reportStatus(undefined, str_msg, obj_res);
    }

    try{

        if(url.indexOf('https://') === 0){ // `http**s**` protocol was specified
            func_forInvokingGetMethod = https;

        }else{  // `http**s**` protocol was not specified
            func_forInvokingGetMethod = http; // treat as `http` protocol
        }
        
        // 
        // http.get(url[, options][, callback])  
        // https://nodejs.org/api/http.html#http_http_get_url_options_callback
        // 
        var req = func_forInvokingGetMethod.get(url, function(obj_incomingMsg){
            // 
            // argument `obj_incomingMsg` is an instance of http.IncomingMessage  
            // https://nodejs.org/api/http.html#http_class_http_incomingmessage
            //
    
            obj_res = {
                'statusCode':obj_incomingMsg.statusCode,
                'statusMessage':obj_incomingMsg.statusMessage,
                'headers':obj_incomingMsg.headers,
                'complete':obj_incomingMsg.complete
            };
    
            // 1: Wait for http response
            //  | | | |
            //  v v v v
            // 2: Got http response
            func_nextStage(); // Goto next stage
            
            if (obj_incomingMsg.statusCode !== 200) {
                //
                // pattern.3 with IncomingMessage
                // HTTP response status code が 200(OK) ではない場合はここにくる
                //
    
                //
                // http.get(url[, options][, callback]) して生成される http.ClientRequest class のドキュメントで、
                // `the data from the response object must be consumed` とのことなので、
                // HTTP response status code が 200(OK) ではない場合は、 `.resume()` して終了する  
                // https://nodejs.org/api/http.html#http_class_http_clientrequest
                //
                obj_incomingMsg.on('end', function(){
                    func_reportResult( // 失敗として終了
                        false,
                        'Bad response. Cannot start downloading.',
                        obj_res)
                    ;
                });
                obj_incomingMsg.resume(); // Consume response data to free up memory
                return;
            }
            
            var int_parsedToDownloadByteSize = parseInt(obj_incomingMsg.headers['content-length']);

            // incomingMsg.headers['content-length'] が整数値として無効な場合は undefined のままとする
            // incl. incomingMsg.headers['content-length'] が存在しない場合
            if(!isNaN(int_parsedToDownloadByteSize)){
                int_toDownloadByteSize = int_parsedToDownloadByteSize;
            }

            int_downloadedByteSize = 0;
            
            // If empty string specified, this function returns requested response only.
            if(
                (typeof fileName != 'string') ||
                (fileName == '')
            ){
                req.destroy();
                func_reportResult( // 成功として終了
                    true,
                    'Only requested status code.',
                    obj_res)
                ;
                return;
            }

            // Open outfile stream
            var obj_writeStream = fs.createWriteStream(fileName);
            obj_incomingMsg.pipe(obj_writeStream);

            obj_incomingMsg.on('data',function(chunk){
                int_downloadedByteSize += chunk.length;

                if(typeof dlProgressListener == 'function'){
                    dlProgressListener(int_downloadedByteSize, int_toDownloadByteSize);
                }
                
            });
            obj_incomingMsg.on('end', function(){
                
                obj_writeStream.close();
                
                obj_res['complete'] = obj_incomingMsg.complete;
                
                if(!obj_incomingMsg.complete){ // 中断された場合
                    // pattern.4 with IncomingMessage
                    func_reportResult( // 失敗として終了
                        false,
                        'The connection was terminated while the message was still being sent',
                        obj_res)
                    ;
                }else{ //中断されなかった場合

                    // pattern.5 with IncomingMessage

                    // 3: Waiting for download completion
                    //  | | | |
                    //  v v v v
                    // 4: Completed
                    func_nextStage(); // Goto next stage

                    func_reportResult( // 成功として終了
                        true,
                        'OK',
                        obj_res)
                    ;
                }
            });

            // 2: Got http response
            //  | | | |
            //  v v v v
            // 3: Waiting for download completion
            func_nextStage(); // Goto next stage
            
        });
    
        req.setTimeout(int_msTimeForTimeOut, function(){
            // 
            // pattern.4 with IncomingMessage
            // Download 中に接続がタイムアウトした場合はここにくる
            // ただし、サーバーとの接続要求でタイムアウトが発生した場合は、
            // `req.on('error', function(e){` がコールされ、
            // この callback はコールされない(note: 設定したタイムアウト用待ち時間は発生する)
            // e.g.
            //  - Download 中のサーバダウン
            //  - Download 中の LAN cable / Wi-Fi 切断
            // 
    
            req.destroy(); // Goto -> `obj_incomingMsg.on('end', function(){`
            // note
            // `.destroy()` を使っても、`.abort()` を使っても、
            // `https.get(options[, callback])` に指定した callback function へ渡される
            // 引数オブジェクト `http.IncomingMessage` の `.complete` プロパティは、
            // `false` のまま。なのでどちらを使っても構わない
        });
    
        req.on('error', function(e){
            //
            // pattern.2 no IncomingMessage
            // サーバーとの接続確立前に発生したエラーはここにくる
            // e.g. 
            //  - DNS エラー
            //  - http response 取得前に req.abort() or req.destroy() がたたかれた
            //  - https.get した時点でネットワーク接続がない( LAN cable / Wi-Fi 切断等)
            //
            func_reportResult(false, String(e)); // 失敗として終了
            return;
        });
    
    }catch(e){
        //
        // pattern.1 no IncomingMessage
        // URL 文字列が無効な場合に発生したエラーはここにくる
        // e.g.
        //  - URL が `https://` (note: not `http://`) で始まらない  
        //
        func_reportResult(false, String(e)); // 失敗として終了
        return;
    }

    // 0: Generate http request
    //  | | | |
    //  v v v v
    // 1: Wait for http response
    func_nextStage(); // Goto next stage

    function func_nextStage(){
        int_stage++;

        if(typeof stageListener == 'function'){
            stageListener(int_stage, obj_stageDef[int_stage]);
        }
    }

    function func_reportStatus(bool_isOK, str_message, obj_incomingMsg){
        var obj_result = {};

        obj_result['identifier'] = identifier;
        obj_result['haveDone'] = bool_haveDone;
        if(typeof bool_isOK != 'undefined'){
            obj_result['isOK'] = bool_isOK;
        }
        obj_result['message'] = str_message;
        obj_result['url'] = url;
        obj_result['fileName'] = fileName;
        obj_result['lastStageNumber'] = int_stage;
        obj_result['lastStageMessage'] = obj_stageDef[int_stage];

        if(typeof obj_incomingMsg == 'object'){
            obj_result['incomingMsg'] = {...obj_incomingMsg};
        }
        if(typeof int_toDownloadByteSize == 'number'){
            obj_result['toDownloadByteSize'] = int_toDownloadByteSize;
        }
        if(typeof int_downloadedByteSize == 'number'){
            obj_result['downloadedByteSize'] = int_downloadedByteSize;
        }

        return obj_result;
    }

    function func_reportResult(bool_isOK, str_message, obj_incomingMsg){

        bool_haveDone = true;
        str_reportedMessage = str_message;
        var obj_result = func_reportStatus(bool_isOK, str_message, obj_incomingMsg);

        if(typeof resultListener == 'function'){ 
            resultListener(obj_result);
        }
    }
}
