import {flow, getRoot, types} from 'mobx-state-tree';
import {Step} from "./Step";
import {Terminal} from "./Terminal";
import {message} from "antd";

export const Scenario = types
  .model('Scenario', {
    title: '',
    description: '',
    environment: '',
    shell:'/bin/sh',
    vscode_port:-1,
    docker_endpoint:'',
    binds: types.array(types.string),
    privileged: false,
    steps: types.array(Step),
    terminals: types.array(Terminal)
  }).volatile(self => ({
    vscodeUrl:null,
    stepIndex: 0,
    containerId: '',
    wsAddr: '',
    creating: false
  })).views(self => ({
    get store() {
      return getRoot(self);
    },
    get needTime() {
      let wc = 0;
      self.steps.map(step => wc += step.content.length);
      return Math.ceil(wc / 360);
    }
  })).actions(self => {

    const createContainer =flow(function* () {
      try {
        self.setCreated(true);
        const containerMode={"kfcoding-auto-delete":"true"};
        const dockerEndpoint=self.docker_endpoint===''?self.store.dockerEndpoint:self.docker_endpoint;
        let exposedPorts={};
        let vscodePort=null;
        if(self.vscode_port!==-1) {
          vscodePort=self.vscode_port;
          exposedPorts[`${vscodePort}/tcp`] = {};
        }
        const steps=self.steps;
        for(var i=0;i<steps.length;i++){
          const {extraTab}=steps[i];
          var matches = extraTab.match(/(\[:).+?(?=])/mg);
          if (matches && matches.length > 0){
            matches[0]=matches[0].replace('[:','');
            exposedPorts[`${matches[0]}/tcp`]={}
          }
        }
        let env=[];
        const tempEnv=window.env;
        if(tempEnv!=null && tempEnv.constructor===Array){
          let flag=true;
          for(var item of tempEnv){
            if(item.constructor!==String){
              flag=false;
            }
            if(flag){
              env=tempEnv;
            }
          }
        }
        let url=`${dockerEndpoint}/containers/create`;
        let response=yield fetch(url, {
          headers: {
            'Content-Type': 'application/json'
          },
          method: 'POST',
          mode: 'cors',
          body: JSON.stringify({
            Image: self.environment,
            Entrypoint: self.shell,
            Env:env,
            Labels:containerMode,
            AttachStdin: true,
            AttachStdout: true,
            AttachStderr: true,
            Tty: true,
            OpenStdin: true,
            ExposedPorts: exposedPorts,
            HostConfig: {
              Privileged: self.privileged || false,
              PublishAllPorts: true,
              Binds: self.binds
            }
          })
        });
        let status=response.status;
        if(status===201){
          let data=yield response.json();
          const containerId=data.Id;
          console.log("container created:",containerId);
          self.setContainerId(containerId);
          self.terminals[0].setContainerId(containerId);
          url=`${dockerEndpoint}/containers/${containerId}/start`;
          yield fetch( url, {method: 'POST',mode: 'cors'});
          self.steps[self.stepIndex].beforeStep();
          url=`ws${dockerEndpoint.substr(4)}/containers/${containerId}/attach/ws?logs=1&stream=1&stdin=1&stdout=1&stderr=1`;
          let socket = new WebSocket(url);
          self.terminals[0].terminal.attach(socket, true, true);
          socket.onopen = () => socket.send("\n");

          if(self.vscode_port){
            url=`${dockerEndpoint}/containers/${containerId}/json`;
            response=yield fetch( url, {method: 'GET',mode:'cors'});
            data=yield response.json();
            const host = dockerEndpoint.match(/(http:\/\/).+?(?=:)/)[0];
            const vscodeUrlPort=data.NetworkSettings.Ports[`${vscodePort}/tcp`][0].HostPort;
            const vscodeUrl = `${host}:${vscodeUrlPort}`;
            let count=0;
            let that=self;
            const show = message.loading("正在启动vscode...",0);
            const event=setInterval(async function() {
              try {
                url=`${dockerEndpoint}/containers/${containerId}/top?ps_args=-a`;
                response=await fetch(url, {method: 'GET',mode:'cors'});
                const data=await response.json();
                const processes=data["Processes"];
                for(const process of processes){
                  const command=process[3];
                  if("code-server"===command){
                    setTimeout(show, 100);
                    console.log("vscode url:",vscodeUrl);
                    message.success("vscode启动成功!");
                    that.setCodeUrl(vscodeUrl);
                    clearInterval(event);
                    break;
                  }
                }
                console.log("waitting for vscode setup ......");
                count+=1;
              }
              catch (e) {
                console.log(e);
                count+=1;
              }
              if(count>20){
                setTimeout(show, 100);
                message.error("启动vscode超时");
                clearInterval(event);
              }
            }, 1500);
          }
        }
        else{
          let data=yield response.json();
          let information=data["message"];
          if(information.indexOf("No such image")!==-1) {
            const hide = message.error("镜像不存在，下载中...",0);
            const group = self.environment.split(":");
            const image = group[0];
            const tag = group[1];
            url = `${dockerEndpoint}/images/create?fromImage=${image}&tag=${tag}`;
            response = yield fetch(url, {method: 'POST', mode: 'cors'});
            status = response.status;
            setTimeout(hide, 100);
            if (status === 200) {
              message.success("镜像下载完毕，请刷新!",0);
            }
            else {
              const information = yield response.json();
              message.error(`镜像下载失败:${information["message"]}`,8);
            }
          }
          else{
            message.error(information,8);
          }
        }

      } catch (e) {
        console.log(e)
      }
    });

    const removeContainer =flow(function* () {
      try {
        const dockerEndpoint=self.docker_endpoint===''?self.store.dockerEndpoint:self.docker_endpoint;
        let url=`${dockerEndpoint}/containers/${self.containerId}?v=true&force=true`;
        yield fetch(url, {method: 'DELETE',mode: 'cors'});
      } catch (e) {
        console.log(e)
      }
    });

    return {
      createContainer,
      removeContainer,
      setCodeUrl(url) {
        self.vscodeUrl = url;
      },
      afterCreate() {
        self.terminals.push({})
      },
      clearContainer() {
        self.terminals = [{}]
      },
      setTitle(title) {
        self.title = title;
      },
      setDescription(desc) {
        self.description = desc;
      },
      setContainerId(id) {
        self.containerId = id;
      },
      addTerminal() {
        self.terminals.push({})
      },
      setCreated(flag) {
        self.creating = flag
      },
      setWsAddr(addr) {
        self.wsAddr = addr;
      },
      setImage(image) {
        self.environment = image;
      },
      setStepIndex(idx) {
        self.stepIndex = idx;
        self.steps[self.stepIndex].beforeStep();
      }
    }
  });

