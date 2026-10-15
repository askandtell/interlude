import { Button, Select, Slider } from '@mantine/core';
import { IconMicrophone, IconVolume } from '@tabler/icons-react';
import { useDeviceTest } from '../hooks/useDeviceTest';

interface Props {
  deviceId: string;
  onDevice: (id: string) => void;
  outputId: string;
  onOutput: (id: string) => void;
  voiceVolume: number;
  onVolume: (value: number) => void;
  onError: (e: unknown) => void;
}
export function DevicePanel({
  deviceId,
  onDevice,
  outputId,
  onOutput,
  voiceVolume,
  onVolume,
  onError,
}: Props) {
  const test = useDeviceTest();
  const inputs = test.devices.filter((d) => d.kind === 'audioinput'),
    outputs = test.devices.filter((d) => d.kind === 'audiooutput');
  const canSelectOutput = 'setSinkId' in HTMLMediaElement.prototype;
  return (
    <div className="device-panel">
      <p className="muted">检测只在本机进行，不会把声音发送给房间。关闭设置即停止检测。</p>
      <div className="device-test-row">
        <div>
          <strong>麦克风检测</strong>
          <small>
            {test.status === 'testing'
              ? '对着麦克风说句话，观察下方电平'
              : '点击后请求麦克风权限，不使用摄像头'}
          </small>
        </div>
        <Button
          variant="default"
          leftSection={<IconMicrophone size={17} />}
          loading={test.status === 'requesting'}
          onClick={() => (test.status === 'testing' ? test.stop() : void test.start(deviceId))}
        >
          {test.status === 'testing' ? '停止检测' : '开始检测'}
        </Button>
      </div>
      <div
        className="input-level"
        role="meter"
        aria-label="麦克风输入电平"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={test.level}
      >
        <span style={{ width: `${test.level}%` }} />
      </div>
      <p className="device-test-status" role="status">
        {test.status === 'testing' ? '检测中 · 声音不会回放' : '麦克风检测已关闭'}
      </p>
      {test.failure && (
        <p className="field-error" role="alert">
          {test.failure}
        </p>
      )}
      {inputs.length > 0 && (
        <Select
          label="麦克风设备"
          value={deviceId || 'default'}
          data={inputs.map((d, i) => ({ value: d.deviceId, label: d.label || `麦克风 ${i + 1}` }))}
          onChange={(id) => {
            test.stop();
            onDevice(id || '');
          }}
        />
      )}
      {canSelectOutput && outputs.length > 0 && (
        <Select
          mt="md"
          label="播放输出设备"
          value={outputId || 'default'}
          data={outputs.map((d, i) => ({ value: d.deviceId, label: d.label || `扬声器 ${i + 1}` }))}
          onChange={(id) => onOutput(id || '')}
        />
      )}
      <div className="device-test-row">
        <div>
          <strong>播放测试音</strong>
          <small>确认电脑或耳机能听到声音</small>
        </div>
        <Button
          variant="default"
          leftSection={<IconVolume size={17} />}
          onClick={() => void test.testTone(outputId).catch(onError)}
        >
          播放测试音
        </Button>
      </div>
      <label className="field-label" htmlFor="voice-level">
        朋友的语音音量
      </label>
      <Slider
        id="voice-level"
        thumbLabel="语音音量"
        aria-label="语音音量"
        value={voiceVolume * 100}
        onChange={(v) => onVolume(v / 100)}
        label={(v) => `${v}%`}
      />
      <p className="muted">
        {canSelectOutput
          ? '开始麦克风检测后可读取设备列表。测试音在浏览器支持时跟随所选输出，否则使用系统默认输出。'
          : '当前浏览器不支持切换播放输出，请使用系统声音设置。'}
      </p>
    </div>
  );
}
