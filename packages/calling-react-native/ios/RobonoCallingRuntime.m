#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import <AVFAudio/AVFAudio.h>
#import <UIKit/UIKit.h>

@interface RobonoCallingRuntime : RCTEventEmitter <RCTBridgeModule>
@property(nonatomic, copy) NSString *owner;
@property(nonatomic) BOOL observing;
@property(nonatomic, strong) NSTimer *clock;
@property(nonatomic) UIBackgroundTaskIdentifier interruptionTask;
@end

@implementation RobonoCallingRuntime
RCT_EXPORT_MODULE();
+ (BOOL)requiresMainQueueSetup { return YES; }
- (dispatch_queue_t)methodQueue { return dispatch_get_main_queue(); }
- (NSArray<NSString *> *)supportedEvents { return @[@"RobonoCallingRuntimeEvent"]; }
- (void)startObserving {
  self.interruptionTask = UIBackgroundTaskInvalid;
  self.observing = YES;
  [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(interrupted:) name:AVAudioSessionInterruptionNotification object:nil];
  [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(reset:) name:AVAudioSessionMediaServicesWereResetNotification object:nil];
}
- (void)stopObserving { self.observing = NO; [[NSNotificationCenter defaultCenter] removeObserver:self]; }
- (void)reset:(NSNotification *)note {
  NSString *token = [self.owner copy];
  dispatch_async(dispatch_get_main_queue(), ^{
    if (token && [self.owner isEqualToString:token] && self.observing) [self sendEventWithName:@"RobonoCallingRuntimeEvent" body:@{@"token":token,@"type":@"audioReset"}];
  });
}
- (void)interrupted:(NSNotification *)note {
  NSString *token = [self.owner copy];
  BOOL began = [note.userInfo[AVAudioSessionInterruptionTypeKey] unsignedIntegerValue] == AVAudioSessionInterruptionTypeBegan;
  BOOL shouldResume = ([note.userInfo[AVAudioSessionInterruptionOptionKey] unsignedIntegerValue] & AVAudioSessionInterruptionOptionShouldResume) != 0;
  dispatch_async(dispatch_get_main_queue(), ^{
    if (!token || ![self.owner isEqualToString:token] || !self.observing) return;
    if (began && self.interruptionTask == UIBackgroundTaskInvalid) {
      // Just enough time to acknowledge hold before audio suspension. No silent
      // playback, indefinite background task or takeover of the cellular call.
      self.interruptionTask = [UIApplication.sharedApplication beginBackgroundTaskWithName:@"Robono call hold" expirationHandler:^{ [self finishInterruptionTask]; }];
    }
    [self sendEventWithName:@"RobonoCallingRuntimeEvent" body:@{@"token":token,@"type":began ? @"interrupted" : @"interruptionEnded",@"shouldResume":@(shouldResume)}];
  });
}
- (void)finishInterruptionTask {
  if (self.interruptionTask != UIBackgroundTaskInvalid) {
    UIBackgroundTaskIdentifier task = self.interruptionTask; self.interruptionTask = UIBackgroundTaskInvalid;
    [UIApplication.sharedApplication endBackgroundTask:task];
  }
}
RCT_EXPORT_METHOD(interruptionHandled:(NSString *)token) {
  if ([self.owner isEqualToString:token]) [self finishInterruptionTask];
}
RCT_REMAP_METHOD(activateAudio, activateAudio:(NSString *)token resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  if (![self.owner isEqualToString:token]) { reject(@"call_cancelled", @"The call has ended.", nil); return; }
  NSError *error = nil;
  if (![[AVAudioSession sharedInstance] setActive:YES error:&error]) {
    reject(@"audio_still_interrupted", @"Audio is in use by another call.", error); return;
  }
  resolve(nil);
}
- (void)tick:(NSTimer *)timer {
  if (self.owner && self.observing) [self sendEventWithName:@"RobonoCallingRuntimeEvent" body:@{@"token":self.owner,@"type":@"tick"}];
}
RCT_REMAP_METHOD(begin, begin:(NSString *)token title:(NSString *)title text:(NSString *)text channel:(NSString *)channel endLabel:(NSString *)endLabel resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  if (self.owner && ![self.owner isEqualToString:token]) { reject(@"audio_busy", @"Another call owns audio.", nil); return; }
  if (UIApplication.sharedApplication.applicationState != UIApplicationStateActive) { reject(@"open_app_to_start_call", @"Open the app to start a call.", nil); return; }
  NSArray *modes = [[NSBundle mainBundle] objectForInfoDictionaryKey:@"UIBackgroundModes"];
  if (![modes containsObject:@"audio"]) { reject(@"background_audio_not_configured", @"Enable the audio background mode for ongoing calls.", nil); return; }
  self.owner = token;
  if (!self.clock) {
    self.clock = [NSTimer timerWithTimeInterval:0.25 target:self selector:@selector(tick:) userInfo:nil repeats:YES];
    [[NSRunLoop mainRunLoop] addTimer:self.clock forMode:NSRunLoopCommonModes];
  }
  // The chosen media/audio adapter owns AVAudioSession. This module observes it;
  // it never replaces the host's category or installs a system calling screen.
  resolve(nil);
}
RCT_REMAP_METHOD(end, end:(NSString *)token resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  if ([self.owner isEqualToString:token]) { self.owner = nil; [self.clock invalidate]; self.clock = nil; [self finishInterruptionTask]; }
  resolve(nil);
}
- (void)invalidate { self.owner = nil; [self.clock invalidate]; self.clock = nil; [self finishInterruptionTask]; [self stopObserving]; [super invalidate]; }
@end
