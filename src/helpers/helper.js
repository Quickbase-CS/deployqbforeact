const { Octokit } = require('@octokit/rest');

let arguments = process.argv;
const GITHUB_TOKEN = arguments[2]?.split('=')[1];

const octokit = new Octokit({
  auth: GITHUB_TOKEN || process.env.GITHUB_TOKEN,
});

const axios = require('axios');

module.exports = {
  /**
   * @param  {} {owner
   * @param  {} repo
   * @param  {} path
   * @param  {} ref}
   * @param  {owner} =>{const{data}=awaitoctokit.rest.repos.getContent({owner
   * @param  {repo} repo
   * @param  {path} path
   * @param  {ref} ref
   * @param  {} }
   */
  getFileContent: async ({ owner, repo, path, ref }) => {
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
      ref,
    });
    return data?.content;
  },

  /**
   * @param  {} owner
   * @param  {} repo
   * @param  {} =>{constindex=0;const{data}=awaitoctokit.request('GET/repos/{owner}/{repo}/commits'
   * @param  {} {owner
   * @param  {} repo
   * @param  {'1'} per_page
   * @param  {{'X-GitHub-Api-Version':'2022-11-28'} headers
   * @param  {} }
   * @param  {} }
   */
  getLatestCommitSHA: async (owner, repo) => {
    const index = 0;
    const { data } = await octokit.request(
      'GET /repos/{owner}/{repo}/commits',
      {
        owner,
        repo,
        per_page: '1',
        headers: {
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    );
    return data[index]?.sha;
  },

  /**
   * @param  {} owner
   * @param  {} repo
   * @param  {} commit_sha
   * @param  {} =>{constindex=0;const{data}=awaitoctokit.request('GET/repos/{owner}/{repo}/commits/{commit_sha}/branches-where-head'
   * @param  {} {owner
   * @param  {} repo
   * @param  {} commit_sha
   * @param  {{'X-GitHub-Api-Version':'2022-11-28'} headers
   * @param  {} }
   * @param  {} }
   */
  getBranchFromLatestCommit: async (owner, repo, commit_sha) => {
    const index = 0;
    const { data } = await octokit.request(
      'GET /repos/{owner}/{repo}/commits/{commit_sha}/branches-where-head',
      {
        owner,
        repo,
        commit_sha,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    );
    return data[index]?.name;
  },

  /**
   * Returns a filename from an array given an extension.
   * @param {String} extension The Extension of the file you are looking for
   * @param {Array} array Array of file names from a given directory.
   */
  getFileNameFromExt_h: (array, extension) => {
    const length = array.length;
    let name = false;
    for (let i = 0; i < length; i++) {
      if (array[i].includes(extension)) {
        name = array[i];
      }
    }
    return name;
  },

  /**
   * Used to loop through the files housed in the qbcli.json that the user wants added to QB
   * @param {Array} filesArray Array of files.  First index is filename, second is the path to the file directory
   * @param {Function} getFileContents Give a path, obtains the contents of a file and returns that as a string
   * @param {String} prefix The prefix of the file chosen to be prepended to the file in Quick Base.
   * @return {Array} Returns an array of file contents to be added to Quick Base OR false if any files were misssing.  Index 0 is filename, Index 1 is file contents to be added to Quick Base, and if the file is the main launch file (isIndexFile = true in qbcli.json) return true at index position 2 in the array
   */
  getAllFileContents: function (
    filesArray,
    prefix,
    gitRepoObjForDeployDirObj,
    stripBom
  ) {
    let missingFiles = false;
    const escapeRegExp = (string) => {
      return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    };

    //replaces all occurances of a substtring in a string.
    const replaceAll = (str, find, replace) => {
      return str.replace(new RegExp(escapeRegExp(find), 'g'), replace);
    };

    let contents = filesArray.map(async (item) => {
      //concats the filename and path to file

      const filePath = gitRepoObjForDeployDirObj.path + '/' + item.filename;
      const newObj = { ...gitRepoObjForDeployDirObj, path: filePath };
      let fileContents = await this.getFileContent(newObj);
      fileContents = Buffer.from(fileContents, 'base64').toString();

      //if file has no content return false and set flag
      if (fileContents.length < 1 && missingFiles === false) {
        missingFiles = true;
        return false;
      } else {
        //remove the byte order mark - this shows up in files occasionally and messes up xml import (adds a character to the dbpage in question)
        fileContents = stripBom(fileContents);
      }

      //replace dependencies if they exist.  Handles replacing depencies for the project and naming them correctly based on the prefix provided by the user.
      if (item.dependencies && item.dependencies.length > 0) {
        //dependency is the numeric value set in qbcli.json file.
        item.dependencies.forEach((i) => {
          let dependencyFileName = filesArray[i].filename;
          let updatedFileName = `${prefix}${dependencyFileName}`;

          fileContents = replaceAll(
            fileContents,
            `pagename=${dependencyFileName}`,
            `pagename=${updatedFileName}`
          );
        });
      }

      let string = escapeRegExp(']]>');
      let regexp = new RegExp(string, 'g');

      //sanitize fileContents for CDATA tags
      return [item.filename, fileContents.replace(regexp, ']]]]><![CDATA[>')];
    });

    if (missingFiles) {
      return false;
    } else {
      return contents;
    }
  },

  /**
   * Used to generate an array of promises for all API calls for adding dbpages to QB from file contents.
   * @param {String} dbid Application dbid
   * @param {String} realm QB realm
   * @param {String} usertoken Usertoken for QB
   * @param {String} apptoken apptoken for QB
   * @param {String} fileContentsArray An array of files to be added to QB.  Index 1 = filename Index 2 = File contents
   * @param {Function} addUpdateDbPage Returns a promise for add/update QB dbpage.
   */
  generateAllAPICallPromises: function (
    configs,
    fileContentsArray,
    addUpdateDbPage
  ) {
    let { dbid, realm, apptoken, usertoken } = configs;
    return fileContentsArray.map((item) => {
      let [fileName, fileContents] = item;
      return addUpdateDbPage(
        dbid,
        realm,
        usertoken,
        apptoken,
        fileContents,
        fileName
      );
    });
  },

  /**
   * Used to create the custom extension prefix.
   * @param {Object} config qbcli.json configuration object.
   * @param {Boolean} deploymentType Boolean used to determine if this is a production/dev deployment.
   * @param {String} repositoryId Repo unique identifier.
   */
  prefixGenerator: function (config, deploymentType, repositoryId) {
    const { customPrefix, customPrefixProduction } = config;
    //for dev
    if (deploymentType === 'dev') {
      if (customPrefix) {
        return `${customPrefix}_${repositoryId}_`;
      } else {
        return `D_${repositoryId}_`;
      }
    }

    //for prod
    if (deploymentType === 'prod') {
      if (customPrefixProduction) {
        return `${customPrefixProduction}_${repositoryId}_`;
      } else {
        return `P_${repositoryId}_`;
      }
    }

    /*
    //for feat
    if (deploymentType === 'feat') {
      if (customPrefixFeature) {
        return `${customPrefixFeature}_${repositoryId}_`;
      } else {
        return `F_${repositoryId}_`;
      }
    }
    */

    return returnPrefix;
  },

  /**
   * this methods enables user to deploy the files from the folder to the respective realm qb pages
   * @param  {} dbid
   * @param  {} realm
   * @param  {} usertoken
   * @param  {} apptoken=null
   * @param  {} pagebody
   * @param  {} pagename
   */
  addUpdateDbPage: (
    dbid,
    realm,
    usertoken,
    apptoken = null,
    pagebody,
    pagename
  ) => {
    const url = `https://${realm}.quickbase.com/db/${dbid}`;
    let apptokenString = '';
    if (apptoken) {
      apptokenString = `<apptoken>${apptoken}</apptoken>`;
    }
    let data = `
            <qdbapi>
                <pagename>${pagename}</pagename>
                <pagetype>1</pagetype>
                <pagebody><![CDATA[${pagebody}]]></pagebody>
                <usertoken>${usertoken}</usertoken>
                ${apptokenString}
            </qdbapi>
        `;
    // Send a POST request
    return axios({
      method: 'post',
      url: url,
      headers: {
        X_QUICKBASE_RETURN_HTTP_ERROR: 'true',
        'QUICKBASE-ACTION': 'API_AddReplaceDBPage',
        'Content-Type': 'application/xml',
      },
      data,
    });
  },
};
