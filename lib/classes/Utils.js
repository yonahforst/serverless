'use strict';

const fs = require('fs');
const path = require('path');
const YAML = require('js-yaml');
const BbPromise = require('bluebird');
const fse = BbPromise.promisifyAll(require('fs-extra'));
const _ = require('lodash');
const fetch = require('node-fetch');

class Utils {
  constructor(serverless) {
    this.serverless = serverless;
  }

  dirExistsSync(dirPath) {
    try {
      const stats = fse.statSync(dirPath);
      return stats.isDirectory();
    } catch (e) {
      return false;
    }
  }

  fileExistsSync(filePath) {
    try {
      const stats = fse.lstatSync(filePath);
      return stats.isFile();
    } catch (e) {
      return false;
    }
  }

  writeFileSync(filePath, conts) {
    let contents = conts || '';

    fse.mkdirsSync(path.dirname(filePath));

    if (filePath.indexOf('.json') !== -1 && typeof contents !== 'string') {
      contents = JSON.stringify(contents, null, 2);
    }

    const yamlFileExists = (filePath.indexOf('.yaml') !== -1);
    const ymlFileExists = (filePath.indexOf('.yml') !== -1);

    if ((yamlFileExists || ymlFileExists) && typeof contents !== 'string') {
      contents = YAML.dump(contents);
    }

    return fse.writeFileSync(filePath, contents);
  }

  writeFile(filePath, contents) {
    const that = this;
    return new BbPromise((resolve, reject) => {
      try {
        that.writeFileSync(filePath, contents);
      } catch (e) {
        reject(e);
      }
      resolve();
    });
  }

  readFileSync(filePath) {
    let contents;

    // Read file
    contents = fse.readFileSync(filePath);

    // Auto-parse JSON
    if (filePath.endsWith('.json')) {
      contents = JSON.parse(contents);
    } else if (filePath.endsWith('.yml') || filePath.endsWith('.yaml')) {
      contents = YAML.load(contents.toString());
    } else {
      contents = contents.toString().trim();
    }

    return contents;
  }

  readFile(filePath) {
    const that = this;
    let contents;
    return new BbPromise((resolve, reject) => {
      try {
        contents = that.readFileSync(filePath);
      } catch (e) {
        reject(e);
      }
      resolve(contents);
    });
  }

  walkDirSync(dirPath) {
    let filePaths = [];
    const list = fs.readdirSync(dirPath);
    list.forEach((filePathParam) => {
      let filePath = filePathParam;
      filePath = path.join(dirPath, filePath);
      const stat = fs.statSync(filePath);
      if (stat && stat.isDirectory()) {
        filePaths = filePaths.concat(this.walkDirSync(filePath));
      } else {
        filePaths.push(filePath);
      }
    });

    return filePaths;
  }

  copyDirContentsSync(srcDir, destDir) {
    const fullFilesPaths = this.walkDirSync(srcDir);

    fullFilesPaths.forEach(fullFilePath => {
      const relativeFilePath = fullFilePath.replace(srcDir, '');
      fse.copySync(fullFilePath, path.join(destDir, relativeFilePath));
    });

    return;
  }

  generateShortId(length) {
    return Math.random().toString(36).substr(2, length);
  }

  findServicePath() {
    let servicePath = null;

    if (this.serverless.utils.fileExistsSync(path.join(process.cwd(), 'serverless.yml'))) {
      servicePath = process.cwd();
    } else if (this.serverless.utils.fileExistsSync(path.join(process.cwd(), 'serverless.yaml'))) {
      servicePath = process.cwd();
    }

    return servicePath;
  }

  track(serverless) {
    const writeKey = 'XXXX'; // TODO: Replace me before release

    const loadedPlugins = serverless.pluginManager.plugins.map((plugin) => plugin.constructor.name);
    const events = [];

    if (serverless.service && serverless.service.functions) {
      _.forEach(serverless.service.functions, (func) => {
        if (func.events) {
          func.events.forEach((event) => {
            const name = Object.keys(event)[0];
            const alreadyPresentEvent = _.find(events, { name });
            if (alreadyPresentEvent) {
              alreadyPresentEvent.count++;
            } else {
              events.push({
                name,
                count: 1,
              });
            }
          });
        }
      });
    }

    const auth = `${writeKey}:`;

    const data = {
      userId: 'anonymousUser',
      event: 'Serverless framework usage',
      properties: {
        commands: serverless.processedInput.commands,
        operatingSystem: process.platform,
        loadedPlugins,
        serverlessVersion: serverless.version,
        numberOfFunctions: _.size(serverless.service.functions),
        events,
        totalNumberOfEvents: events.length,
        provider: serverless.service.provider,
        isRunInsideService: (!!serverless.config.servicePath),
      },
    };

    fetch('https://api.segment.io/v1/track', {
      headers: {
        Authorization: `Basic ${new Buffer(auth).toString('base64')}`,
        'content-type': 'application/json',
      },
      method: 'POST',
      timeout: '1000',
      body: JSON.stringify(data),
    })
      .then((response) => response.json())
      .then(() => BbPromise.resolve())
      .catch(() => BbPromise.resolve());
  }
}

module.exports = Utils;
