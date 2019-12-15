import React from 'react';
import {Icon, Tabs} from "antd";
import Term from "./Term";
import {inject, observer} from "mobx-react";

class TrainPanel extends React.Component {
  state={
    defaultActiveKey:'term',
    trigger:false
  };

  tabClickHandler = (params) => {
    this.setState({
      defaultActiveKey:params
    })
  };

  render() {
    let scenario = this.props.scenario;
    let current = this.props.step;
    const step=scenario.steps[current];
    const {defaultActiveKey,trigger}=this.state;
    if(!trigger){
      if(step.extraTabUrl){
        this.setState({
          defaultActiveKey:'desktop',
          trigger:true
        })
      }
    }

    return (
      <Tabs
        style={{height: '100%'}}
        activeKey={defaultActiveKey}
        onTabClick={(params)=>this.tabClickHandler(params)}
      >
        <Tabs.TabPane
          tab={
            <span>
              <Icon type="code"/>
              Terminal
            </span>
          }
          key={'term'}
          closable='false'
          style={{height: '100%'}}
          forceRender={true}
        >
          <Term secnario={scenario}/>
        </Tabs.TabPane>
        {
          step.extraTabUrl &&
          <Tabs.TabPane
            tab={
              <span>
                <Icon type="desktop" />
                Panel
              </span>
            }
            key={'desktop'}
            closable='false'
          >
            <iframe src={step.extraTabUrl} style={{width: '100%', height: '100%', border: '0'}}/>
          </Tabs.TabPane>
        }
        {
          scenario.vscodeUrl &&
          <Tabs.TabPane
            tab={
              <span>
                <Icon type="edit" />
                Code
              </span>
            }
            key={'code'}
            closable='false'
          >
            <iframe src={scenario.vscodeUrl} style={{width: '100%', height: '100%', border: '0'}}/>
          </Tabs.TabPane>
        }
      </Tabs>
    )
  }
}

export default inject('store')(observer(TrainPanel));
